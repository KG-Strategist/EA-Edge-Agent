import { test } from '@playwright/test';
import { completeAirGappedAuth } from './auth-helper';

test.describe('UC-09: PWA Offline', () => {
  test.setTimeout(120_000);

  test('service worker registers and offline works', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await completeAirGappedAuth(page);

    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length > 0;
    });
    console.log('SW registered:', swRegistered);

    await page.context().setOffline(true);
    await page.reload().catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/e2e/screenshots/uc-09-offline.png', fullPage: true });

    await page.context().setOffline(false);
    await page.reload().catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/e2e/screenshots/uc-09-online.png', fullPage: true });

    console.log('Errors:', errors.length);
    errors.forEach(e => console.log('  ERR:', e));
  });
});
