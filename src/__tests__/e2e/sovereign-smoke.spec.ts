import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockGgufPath = path.resolve(__dirname, '../fixtures/mock_tiny.gguf');
const smokeModelId = `sovereign-smoke-${Date.now()}`;

test.describe('EA-NITI Sovereign Engine smoke gate', () => {
  test.setTimeout(180_000);

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

    await page.getByTestId('auth-pseudonym').fill(`e2e-smoke-${Date.now()}`);
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

  test('sideloads a mock GGUF into OPFS and registers it locally', async ({ page, context }) => {
    await completeStandaloneSignup(page, context);
    await navigateToAdminSubView(page, 'system-pref', 'models');

    await expect(page.getByTestId('model-sandbox-tab')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('sideload-model-name').fill(smokeModelId);
    await page.getByTestId('sandbox-sideload-input').setInputFiles(mockGgufPath);

    await expect(page.getByTestId('sideload-progress')).toContainText(/complete/i, {
      timeout: 30_000,
    });

    const registered = await page.evaluate(async ({ modelId }) => {
      return new Promise<{ modelUrl?: string; isLocalhost?: boolean } | null>((resolve, reject) => {
        const openRequest = indexedDB.open('EADatabase');
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const tx = database.transaction('model_registry', 'readonly');
          const indexRequest = tx.objectStore('model_registry').index('name').get(modelId);
          indexRequest.onerror = () => {
            database.close();
            reject(indexRequest.error);
          };
          indexRequest.onsuccess = () => {
            const record = indexRequest.result;
            database.close();
            resolve(record ? {
              modelUrl: record.modelUrl,
              isLocalhost: record.isLocalhost,
            } : null);
          };
        };
      });
    }, { modelId: smokeModelId });

    expect(registered?.isLocalhost).toBe(true);
    expect(registered?.modelUrl).toBe(`opfs://${smokeModelId}.gguf`);
  });
});
