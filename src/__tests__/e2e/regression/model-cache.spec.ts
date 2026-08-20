import { test, expect, type Page } from '@playwright/test';
import { completeAirGappedAuth } from './auth-helper';

/**
 * UC-MODEL: Model Cache / Download / Sideload — THE KEY BUG
 *
 * Diagnostic findings from first run:
 * - WebGPU: available=true, adapter="no adapter" (headless Chrome has no GPU)
 * - OPFS: undefined (navigator.storage.getDirectory() not available)
 * - Model Registry: [] (empty)
 * - Air-gap consent says: "A temporary internet connection (via Settings) is required for initial local LLM model caching"
 */
test.describe('Model Cache Lifecycle', () => {
  test.setTimeout(300_000);

  test('diagnostic: WebGPU + OPFS + IndexedDB state', async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await completeAirGappedAuth(page);

    // WebGPU diagnostic
    const webgpuInfo = await page.evaluate(async () => {
      const info: any = { available: 'gpu' in navigator };
      if ('gpu' in navigator) {
        try {
          const adapter = await (navigator as any).gpu.requestAdapter();
          info.adapter = adapter ? { name: adapter.name } : 'no adapter';
        } catch (e: any) { info.adapter = `error: ${e.message}`; }
      }
      return info;
    });

    // OPFS diagnostic
    const opfsInfo = await page.evaluate(async () => {
      try {
        if (!('storage' in navigator) || !('getDirectory' in (navigator as any).storage)) {
          return { available: false, reason: 'getDirectory not supported' };
        }
        const dir = await (navigator as any).storage.getDirectory();
        const entries: string[] = [];
        for await (const entry of dir.values()) entries.push(entry.name);
        return { available: true, entries };
      } catch (e: any) { return { available: false, error: e.message }; }
    });

    // IndexedDB model_registry
    const modelRegistry = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('ea-niti-edge-agent');
        req.onsuccess = (e: any) => {
          try {
            const db = e.target.result;
            const names = [...db.objectStoreNames];
            if (!names.includes('model_registry')) {
              resolve({ stores: names, model_registry: 'not found' });
              return;
            }
            const tx = db.transaction('model_registry', 'readonly');
            const getAll = tx.objectStore('model_registry').getAll();
            getAll.onsuccess = () => resolve({ stores: names, model_registry: getAll.result });
            getAll.onerror = () => resolve({ stores: names, model_registry: [] });
          } catch { resolve({ stores: [], model_registry: 'error' }); }
        };
        req.onerror = () => resolve({ stores: [], model_registry: 'error' });
      });
    });

    console.log('=== MODEL CACHE DIAGNOSTICS ===');
    console.log('WebGPU:', JSON.stringify(webgpuInfo, null, 2));
    console.log('OPFS:', JSON.stringify(opfsInfo, null, 2));
    console.log('Model Registry:', JSON.stringify(modelRegistry, null, 2));
    console.log('Console errors:', errors.length);
    errors.forEach(e => console.log('  ERROR:', e));
    console.log('Console warnings:', warnings.length);
    warnings.slice(0, 5).forEach(w => console.log('  WARN:', w));

    await page.screenshot({ path: 'test-results/e2e/screenshots/model-cache-diag.png', fullPage: true });

    // Always passes — diagnostic only
    expect(webgpuInfo.available).toBeTruthy();
  });

  test('navigate to Model Sandbox via admin', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await completeAirGappedAuth(page);

    // Try navigating to admin
    const adminNav = page.locator('a[href*="admin"], button:has-text("Admin"), [data-testid*="admin"]');
    if (await adminNav.count() > 0) {
      await adminNav.first().click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-results/e2e/screenshots/model-sandbox-tab.png', fullPage: true });

    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('Admin nav found:', await adminNav.count() > 0);
    console.log('Contains "Model":', bodyText.includes('Model'));
    console.log('Contains "Sandbox":', bodyText.includes('Sandbox'));
    console.log('Errors:', errors.length);
    errors.forEach(e => console.log('  ERR:', e));
  });

  test('AgentChat model status on send', async ({ page }) => {
    const errors: string[] = [];
    const modelErrors: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') errors.push(text);
      if (text.includes('MODEL_NOT_CACHED') || text.includes('not cached')) modelErrors.push(text);
    });
    page.on('pageerror', err => errors.push(err.message));

    await completeAirGappedAuth(page);

    // Open chat
    const chatBtn = page.locator('[data-testid="agentchat-open-button"], button:has-text("Chat"), button[aria-label*="chat" i]');
    if (await chatBtn.count() > 0) {
      await chatBtn.first().click();
      await page.waitForTimeout(2000);
    }

    // Send a message
    const chatInput = page.locator('textarea, input[placeholder*="message" i], input[placeholder*="type" i], [data-testid*="chat-input"]');
    if (await chatInput.count() > 0) {
      await chatInput.first().fill('Hello');
      const sendBtn = page.locator('button:has-text("Send"), button[aria-label*="send" i]');
      if (await sendBtn.count() > 0) {
        await sendBtn.first().click();
        await page.waitForTimeout(5000);
      }
    }

    await page.screenshot({ path: 'test-results/e2e/screenshots/chat-model-status.png', fullPage: true });

    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('Model not cached message:', bodyText.includes('not cached') || bodyText.includes('download'));
    console.log('Model errors:', modelErrors.length);
    modelErrors.forEach(e => console.log('  MODEL_ERR:', e));
  });

  test('sideload GGUF via file input', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await completeAirGappedAuth(page);

    // Find file input for GGUF
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles('src/__tests__/fixtures/mock_tiny.gguf');
      await page.waitForTimeout(5000);
    }

    await page.screenshot({ path: 'test-results/e2e/screenshots/sideload-attempt.png', fullPage: true });

    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('Sideload complete:', bodyText.includes('complete'));
    console.log('File inputs found:', await fileInput.count());
    console.log('Errors:', errors.length);
    errors.forEach(e => console.log('  ERR:', e));
  });
});
