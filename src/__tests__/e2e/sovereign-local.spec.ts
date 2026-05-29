import path from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const modelPath = process.env.EA_NITI_E2E_GGUF_PATH
  ? path.resolve(process.env.EA_NITI_E2E_GGUF_PATH)
  : '';
const modelId = process.env.EA_NITI_E2E_MODEL_ID
  || (modelPath ? path.basename(modelPath, '.gguf') : 'local-sovereign-e2e');

test.describe('EA-NITI Sovereign Engine local GGUF inference gate', () => {
  test.skip(!modelPath, 'Set EA_NITI_E2E_GGUF_PATH to run the real Sovereign Engine E2E gate.');
  test.setTimeout(720_000);

  async function selectAirGappedMode(page: Page) {
    const standaloneButton = page.getByTestId('auth-standalone-2fa');
    if (await standaloneButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      return;
    }

    await expect(page.getByText('Select Configuration Mode')).toBeVisible({ timeout: 30_000 });
    const airGappedMode = page.locator('button').filter({ hasText: 'Air-Gapped (Isolated)' }).first();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await airGappedMode.click();
      if (await standaloneButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        return;
      }
    }
  }

  async function completeStandaloneSignup(page: Page, context: BrowserContext) {
    await context.clearCookies();
    await context.setOffline(false);
    await page.goto('/');

    await selectAirGappedMode(page);
    await page.getByTestId('auth-standalone-2fa').click({ timeout: 30_000 });
    await page.getByTestId('auth-consent-continue').click();

    await page.getByTestId('auth-pseudonym').fill(`e2e-sovereign-${Date.now()}`);
    await page.getByTestId('auth-passphrase').fill('testpass123');
    await page.getByTestId('auth-pin').fill('123456');
    await page.getByTestId('auth-confirm-pin').fill('123456');
    await page.getByTestId('auth-security-answer-1').fill('answer1');
    await page.getByTestId('auth-security-answer-2').fill('answer2');
    await page.getByTestId('auth-create-vault').click();

    await expect(page.getByTestId('agentchat-open-button')).toBeVisible({ timeout: 60_000 });
  }

  async function navigateToAdminSubView(page: Page, view: string, subView: string) {
    await page.evaluate(({ targetView, targetSubView }) => {
      window.dispatchEvent(new CustomEvent('EA_NAVIGATE', {
        detail: { view: targetView, subView: targetSubView },
      }));
    }, { targetView: view, targetSubView: subView });
  }

  async function preloadModelIntoOPFS(page: Page) {
    await page.evaluate(() => {
      document.getElementById('e2e-gguf-input')?.remove();
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'e2e-gguf-input';
      input.setAttribute('data-testid', 'e2e-gguf-input');
      input.style.display = 'none';
      document.body.appendChild(input);
    });

    await page.getByTestId('e2e-gguf-input').setInputFiles(modelPath);

    const result = await page.evaluate(async ({ targetModelId }) => {
      const input = document.getElementById('e2e-gguf-input') as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (!file) throw new Error('E2E_GGUF_FILE_NOT_ATTACHED');
      if (!file.name.endsWith('.gguf')) throw new Error(`E2E_GGUF_INVALID_EXTENSION: ${file.name}`);

      const safeModelId = targetModelId.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `${safeModelId}.gguf`;
      const magic = [71, 71, 85, 70];

      const validateGGUF = async (blob: Blob) => {
        if (blob.size < 4) throw new Error('E2E_INVALID_GGUF_SIGNATURE: file too small');
        const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
        for (let i = 0; i < magic.length; i += 1) {
          if (bytes[i] !== magic[i]) {
            throw new Error(`E2E_INVALID_GGUF_SIGNATURE: got [${Array.from(bytes).join(',')}]`);
          }
        }
      };

      console.info(`[E2E Sideload] Validating ${file.name} (${Math.round(file.size / 1024 / 1024)} MB)`);
      await validateGGUF(file);

      const root = await navigator.storage.getDirectory();
      try { await root.removeEntry(filename); } catch { /* Existing model did not exist. */ }

      const handle = await root.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      let bytesWritten = 0;
      let lastLoggedPercent = -10;
      const totalBytes = file.size;

      const progressStream = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytesWritten += chunk.byteLength;
          const percent = Math.floor((bytesWritten / totalBytes) * 100);
          if (percent >= lastLoggedPercent + 10 || percent === 100) {
            lastLoggedPercent = percent;
            console.info(`[E2E Sideload] OPFS write ${percent}% (${bytesWritten}/${totalBytes})`);
          }
          controller.enqueue(chunk);
        },
      });

      try {
        await file.stream().pipeThrough(progressStream).pipeTo(writable);
      } catch (error) {
        try { await root.removeEntry(filename); } catch { /* Partial file already gone. */ }
        throw error;
      }

      const storedFile = await (await root.getFileHandle(filename)).getFile();
      if (storedFile.size !== totalBytes) {
        try { await root.removeEntry(filename); } catch { /* Partial file already gone. */ }
        throw new Error(`E2E_OPFS_WRITE_INCOMPLETE: expected ${totalBytes}, stored ${storedFile.size}`);
      }
      await validateGGUF(storedFile);

      await new Promise<void>((resolve, reject) => {
        const openRequest = indexedDB.open('EADatabase');
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const tx = database.transaction('model_registry', 'readwrite');
          const store = tx.objectStore('model_registry');
          const record = {
            name: targetModelId,
            type: 'PRIMARY',
            modelUrl: `opfs://${filename}`,
            isLocalhost: true,
            isActive: true,
            engineType: 'Air-Gapped Sideload',
            contextWindow: 4096,
            allowDistillation: false,
          };

          tx.onerror = () => {
            database.close();
            reject(tx.error);
          };
          tx.oncomplete = () => {
            database.close();
            resolve();
          };

          const indexRequest = store.index('name').get(targetModelId);
          indexRequest.onsuccess = () => {
            const existing = indexRequest.result;
            if (existing?.id) {
              store.put({ ...existing, ...record, id: existing.id });
            } else {
              store.add(record);
            }
          };
          indexRequest.onerror = () => {
            store.add(record);
          };
        };
      });

      console.info(`[E2E Sideload] Registered ${targetModelId} at opfs://${filename}`);
      return { filename, bytes: storedFile.size };
    }, { targetModelId: modelId });

    console.log(`[sovereign-e2e] OPFS preload complete: ${result.filename} (${result.bytes} bytes)`);
  }

  async function configurePrimaryAgentToSideload(page: Page) {
    await navigateToAdminSubView(page, 'agent-config', 'configs');
    await expect(page.getByTestId('agent-config-tab')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('primary-model-source-local').check();
    await expect(page.getByTestId('primary-sideload-select')).toContainText(modelId, {
      timeout: 30_000,
    });
    await page.getByTestId('primary-sideload-select').selectOption(modelId);
    await page.getByTestId('primary-config-save').click();
    await expect(page.getByTestId('primary-config-save')).toContainText(/Config Saved/i, {
      timeout: 30_000,
    });
  }

  async function verifyOfflineInference(page: Page, context: BrowserContext) {
    await context.setOffline(false);
    await page.getByTestId('agentchat-open-button').click();
    await expect(page.getByTestId('agentchat-execution-mode')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('agentchat-execution-mode').selectOption('Primary EA Agent');

    await page.getByTestId('agentchat-message-input').fill(
      'In one concise sentence, explain why enterprise architecture governance matters.'
    );
    await page.getByTestId('agentchat-send-button').click();

    await expect(page.getByText('Primary EA Agent Active')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId('message-assistant').last()).toContainText(/[A-Za-z]{2,}/, {
      timeout: 240_000,
    });

    await context.setOffline(true);
    await page.getByTestId('agentchat-message-input').fill(
      'In three words, state the benefit of local inference.'
    );
    await page.getByTestId('agentchat-send-button').click();

    await expect(page.getByTestId('message-assistant').last()).toContainText(/[A-Za-z]{2,}/, {
      timeout: 240_000,
    });
  }

  test('sideloads a local GGUF and produces offline Sovereign Wasm output', async ({ page, context }) => {
    const runtimeLogs: string[] = [];
    const forbiddenLogs: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[E2E Sideload]')) {
        console.log(text);
      }
      if (/\[SovereignEngine\]|\[Router\]|\[GGUF PARSER\]|EA-NITI Bespoke|GGUF Memory Mapped/.test(text)) {
        runtimeLogs.push(text);
        console.log(text);
      }
      if (/MODEL_NOT_CACHED|WATCHDOG_TIMEOUT|BLIT_TIMEOUT|NO_VISIBLE_TOKENS|INSUFFICIENT_WASM_MEMORY|Worker error/.test(text)) {
        forbiddenLogs.push(text);
      }
    });

    page.on('pageerror', (error) => {
      forbiddenLogs.push(`[pageerror] ${error.message}`);
    });

    await completeStandaloneSignup(page, context);
    await preloadModelIntoOPFS(page);
    await configurePrimaryAgentToSideload(page);
    await verifyOfflineInference(page, context);

    expect(runtimeLogs.join('\n')).toMatch(/\[SovereignEngine\] Worker boot complete/);
    expect(forbiddenLogs).toEqual([]);
  });
});
