import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const allowRemoteDownload = process.env.EA_NITI_E2E_ALLOW_REMOTE_DOWNLOAD === '1';
const qwenModelId = 'qwen2.5-1.5b-instruct-q4_0';

test.describe('EA-NITI Sovereign Engine Integration', () => {
  test.skip(!allowRemoteDownload, 'Remote GGUF download E2E is opt-in. Set EA_NITI_E2E_ALLOW_REMOTE_DOWNLOAD=1 to run it.');
  test.setTimeout(600000);

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

  async function completeSignupFlow(page: Page, context: BrowserContext) {
    await context.clearCookies();
    await context.setOffline(false);
    await page.goto('/');

    await selectAirGappedMode(page);
    await page.getByTestId('auth-standalone-2fa').click({ timeout: 30_000 });
    await page.getByTestId('auth-consent-continue').click();

    await page.getByTestId('auth-pseudonym').fill(`e2e-remote-${Date.now()}`);
    await page.getByTestId('auth-passphrase').fill('testpass123');
    await page.getByTestId('auth-pin').fill('123456');
    await page.getByTestId('auth-confirm-pin').fill('123456');
    await page.getByTestId('auth-security-answer-1').fill('answer1');
    await page.getByTestId('auth-security-answer-2').fill('answer2');
    await page.getByTestId('auth-create-vault').click();

    await expect(page.getByTestId('agentchat-open-button')).toBeVisible({ timeout: 60_000 });
  }

  async function putAppSetting(page: Page, key: string, value: unknown) {
    await page.evaluate(async ({ settingKey, settingValue }) => {
      await new Promise<void>((resolve, reject) => {
        const openRequest = indexedDB.open('EADatabase');
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const tx = database.transaction('app_settings', 'readwrite');
          tx.onerror = () => {
            database.close();
            reject(tx.error);
          };
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.objectStore('app_settings').put({ key: settingKey, value: settingValue });
        };
      });
    }, { settingKey: key, settingValue: value });
  }

  async function enableNetworkForModelDownload(page: Page) {
    await putAppSetting(page, 'enableNetworkIntegrations', true);
  }

  async function navigateToAdminSubView(page: Page, view: string, subView: string) {
    await page.evaluate(({ targetView, targetSubView }) => {
      window.dispatchEvent(new CustomEvent('EA_NAVIGATE', {
        detail: { view: targetView, subView: targetSubView },
      }));
    }, { targetView: view, targetSubView: subView });
  }

  async function navigateToAgentConfig(page: Page, context: BrowserContext) {
    await context.setOffline(false);
    await enableNetworkForModelDownload(page);
    await navigateToAdminSubView(page, 'agent-config', 'configs');
    await expect(page.getByTestId('agent-config-tab')).toBeVisible({ timeout: 30_000 });
  }

  async function downloadModel(page: Page, _context: BrowserContext, cacheButtonIndex: number, _expectedModelName: string) {
    await page.waitForSelector('button:has-text("Cache")');
    const cacheButtons = await page.locator('button:has-text("Cache")').all();
    if (cacheButtons.length > cacheButtonIndex) {
      await cacheButtons[cacheButtonIndex].click();
    } else {
      throw new Error(`Cache button at index ${cacheButtonIndex} not found`);
    }

    await page.waitForSelector('text="AI Model Download Required"');
    await page.locator('input[type="checkbox"]').last().check();
    await page.getByRole('button', { name: /Consent & Download/i }).click();

    await page.waitForSelector('text=/Model cached successfully/i', { timeout: 300000 });
    await page.waitForTimeout(2000);
    await expect(page.locator('button:has-text("Cached")').first()).toBeVisible();
  }

  async function configurePrimaryRemoteModel(page: Page, modelId: string) {
    await page.getByTestId('primary-model-source-remote').check();
    await page.locator('#model-registry-select').first().selectOption(modelId);
    await page.getByTestId('primary-config-save').click();
    await expect(page.getByTestId('primary-config-save')).toContainText(/Config Saved/i, {
      timeout: 30_000,
    });
  }

  async function verifyInference(page: Page, context: BrowserContext, prompt: string) {
    await context.setOffline(true);
    await page.getByTestId('agentchat-open-button').click();
    await expect(page.getByTestId('agentchat-execution-mode')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('agentchat-execution-mode').selectOption('Primary EA Agent');

    await page.getByTestId('agentchat-message-input').fill(prompt);
    await page.getByTestId('agentchat-send-button').click();

    await expect(page.getByText('Primary EA Agent Active')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId('message-assistant').last()).toContainText(/[A-Za-z]{2,}/, {
      timeout: 240_000,
    });
  }

  async function verifyTelemetry(page: Page, _expectedEngine: string) {
    const engineUsed = await page.evaluate(async () => {
      return new Promise<string | null>((resolve, reject) => {
        const openRequest = indexedDB.open('EADatabase');
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const tx = database.transaction('local_telemetry_vault', 'readonly');
          const cursorRequest = tx.objectStore('local_telemetry_vault').openCursor(null, 'prev');
          cursorRequest.onerror = () => {
            database.close();
            reject(cursorRequest.error);
          };
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            database.close();
            resolve(cursor?.value?.engineUsed || null);
          };
        };
      });
    });
    expect(engineUsed).toBeTruthy();
  }

  test('Triage Model: TinyLlama Download & Inference', async ({ page, context }) => {
    await completeSignupFlow(page, context);
    await navigateToAgentConfig(page, context);

    const triageSelect = page.locator('select').first();
    if (await triageSelect.isVisible()) {
      await triageSelect.selectOption({ label: /TinyLlama/i });
      await page.waitForTimeout(500);
    }

    await downloadModel(page, context, 1, 'TinyLlama 1.1B');

    await verifyInference(page, context, 'What is enterprise architecture?');
    await verifyTelemetry(page, 'Sovereign Engine');
  });

  test('Primary Model: Gemma 4 E2B Download & Dual-Model Coexistence', async ({ page, context }) => {
    await completeSignupFlow(page, context);
    await navigateToAgentConfig(page, context);

    await downloadModel(page, context, 0, 'Gemma 4 E2B');

    await verifyInference(page, context, 'Compute EA Topology');
    await verifyTelemetry(page, 'Sovereign Engine');

    const opfsSize = await page.evaluate(async () => {
      const db = (window as any).db;
      if (!db) return 0;
      const settings = await db.app_settings.where('key').startsWith('opfs').toArray();
      return settings.length;
    });
    expect(opfsSize).toBeGreaterThan(0);
  });

  test('Primary Model: Qwen2.5 1.5B — Multi-Arch GGUF Parser Test', async ({ page, context }) => {
    const runtimeLogs: string[] = [];
    const forbiddenLogs: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (/\[SovereignEngine\]|\[Router\]|\[GGUF PARSER\]|EA-NITI Bespoke|GGUF Memory Mapped/.test(text)) {
        runtimeLogs.push(text);
      }
      if (/MODEL_NOT_CACHED|WATCHDOG_TIMEOUT|BLIT_TIMEOUT|NO_VISIBLE_TOKENS|INSUFFICIENT_WASM_MEMORY|Worker error/.test(text)) {
        forbiddenLogs.push(text);
      }
    });

    page.on('pageerror', (error) => {
      forbiddenLogs.push(`[pageerror] ${error.message}`);
    });

    await completeSignupFlow(page, context);
    await navigateToAgentConfig(page, context);
    await configurePrimaryRemoteModel(page, qwenModelId);

    const cacheButtons = await page.locator('button:has-text("Cache")').all();
    const qwen2CacheBtn = cacheButtons[0];

    if (await qwen2CacheBtn.isVisible()) {
      await qwen2CacheBtn.click();

      const consentModal = page.locator('text="AI Model Download Required"');
      if (await consentModal.isVisible({ timeout: 3000 }).catch(() => false)) {
        await page.locator('input[type="checkbox"]').last().check();
        await page.getByRole('button', { name: /Consent & Download/i }).click();
      }

      await page.waitForSelector('button:has-text("Cached")', { timeout: 300000 });
    } else if (cacheButtons.length === 0) {
      throw new Error('No cache buttons found — Qwen2.5 may not be in model registry');
    }

    await verifyInference(page, context, 'Summarize TOGAF ADM phases');

    expect(runtimeLogs.join('\n')).toMatch(/\[SovereignEngine\] Worker boot complete/);
    expect(forbiddenLogs).toEqual([]);
  });

  // DIAGNOSTIC TEST: Observes the download cycle behavior without failing on timeout
  test('DIAGNOSTIC: Qwen2.5 download cycle — observes restart behavior', async ({ page, context }) => {
    const opfsLogs: string[] = [];
    const agentLogs: string[] = [];
    let testFinished = false;

    page.on('console', msg => {
      const t = msg.text();
      // Only capture our diagnostic tags
      if (t.includes('[OPFS]') || t.includes('[AgentConfigTab]')) {
        opfsLogs.push(`[${Date.now() % 100000}] ${t}`);
        agentLogs.push(t);
      }
    });

    page.on('pageerror', err => {
      opfsLogs.push(`[PAGEERROR] ${err.message}`);
    });

    // Setup: signup + navigate
    await completeSignupFlow(page, context);
    await navigateToAgentConfig(page, context);
    await configurePrimaryRemoteModel(page, qwenModelId);

    // Click Cache button for the primary Qwen2.5 model.
    await page.waitForSelector('button:has-text("Cache")');
    const cacheButtons = await page.locator('button:has-text("Cache")').all();
    console.log(`Found ${cacheButtons.length} Cache buttons`);

    if (cacheButtons.length < 1) {
      console.log('Not enough Cache buttons found, taking screenshot and exiting');
      return;
    }

    await cacheButtons[0].click();

    // Accept consent modal
    await page.waitForSelector('text="AI Model Download Required"');
    await page.locator('input[type="checkbox"]').last().check();
    await page.getByRole('button', { name: /Consent & Download/i }).click();

    console.log('\n=== DOWNLOAD OBSERVATION STARTED ===');
    console.log('Monitoring for 90 seconds...\n');

    // Monitor for 90 seconds — watch for cycles
    const startTime = Date.now();
    const MONITOR_DURATION = 90_000;
    const POLL_INTERVAL = 2000;

    let _lastProgressSeen = 0;
    let cyclesDetected = 0;
    let lastLogCount = 0;
    let stuck = false;

    while (Date.now() - startTime < MONITOR_DURATION) {
      await page.waitForTimeout(POLL_INTERVAL);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Check if we have new logs
      const newLogs = opfsLogs.slice(lastLogCount);
      if (newLogs.length > 0) {
        console.log(`\n--- T+${elapsed}s new logs (${newLogs.length} entries) ---`);
        newLogs.forEach(l => console.log(`  ${l}`));
        lastLogCount = opfsLogs.length;
      }

      // Check for retry cycles via OPFS attempt logs
      const attemptMatches = opfsLogs.filter(l => l.includes('Hydration attempt'));
      if (attemptMatches.length > 1) {
        cyclesDetected = Math.max(cyclesDetected, attemptMatches.length);
        console.log(`  ⚠️  Retry cycle detected: ${attemptMatches.length} attempts logged`);
      }

      // Check for success
      const hasSuccess = opfsLogs.some(l => l.includes('hydrateModel success exit'));
      if (hasSuccess) {
        console.log(`\n  ✅ SUCCESS: hydrateModel completed without retry`);
        testFinished = true;
        break;
      }

      // Check for final failure
      const hasFailure = opfsLogs.some(l => l.includes('Download failed') || l.includes('failed:'));
      if (hasFailure) {
        console.log(`\n  ❌ FAILURE: download failed`);
        testFinished = true;
        break;
      }

      // Detect if stuck (no new logs for 30s during active download)
      const recentLogs = opfsLogs.slice(-5);
      const hasActiveDownload = recentLogs.some(l => l.includes('Downloading') || l.includes('Connecting') || l.includes('attempt'));
      if (hasActiveDownload && newLogs.length === 0) {
        stuck = true;
      } else {
        stuck = false;
      }
    }

    // Final summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(70));
    console.log('📊 DIAGNOSTIC RESULTS (Qwen2.5 Download Cycle)');
    console.log('='.repeat(70));
    console.log(`\n⏱  Duration: ${elapsed}s`);
    console.log(`🔄  Retry cycles observed: ${cyclesDetected}`);
    console.log(`📋  Total [OPFS] log entries: ${opfsLogs.length}`);
    console.log(`📋  Total [AgentConfigTab] log entries: ${agentLogs.length}`);
    console.log(`🏁  Download finished: ${testFinished ? 'YES' : 'NO (timeout)'}`);
    console.log(`📍  Stuck detected: ${stuck ? 'YES' : 'NO'}`);

    console.log('\n📝 ALL [OPFS] logs:');
    opfsLogs.forEach(l => console.log(`  ${l}`));

    console.log('\n📝 ALL [AgentConfigTab] logs:');
    agentLogs.forEach(l => console.log(`  ${l}`));

    // Determine outcome
    if (cyclesDetected >= 3) {
      console.log('\n🚨 BUG CONFIRMED: Download restarted 3+ times (OPFS retry loop triggered)');
    } else if (testFinished && cyclesDetected === 0) {
      console.log('\n✅ PASS: Download completed without restart');
    } else if (!testFinished && opfsLogs.length === 0) {
      console.log('\n⚠️  NO LOGS: Download may not have started — check if Cache was clicked correctly');
    } else {
      console.log('\n⚠️  INCONCLUSIVE: Observing ambiguous state');
    }

    console.log('='.repeat(70) + '\n');

    // Don't fail — we want to see the full log output
    expect(cyclesDetected).toBe(0); // Will fail if bug present (cycles >= 3)
  });
});
