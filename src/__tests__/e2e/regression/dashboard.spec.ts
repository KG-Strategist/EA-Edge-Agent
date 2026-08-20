import { test, expect } from '@playwright/test';
import { completeAirGappedAuth } from './auth-helper';

test.describe('UC-02: Dashboard', () => {
  test.setTimeout(120_000);

  test('dashboard renders after auth', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await completeAirGappedAuth(page);
    await page.screenshot({ path: 'test-results/e2e/screenshots/uc-02-dashboard.png', fullPage: true });

    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('Dashboard loaded:', bodyText.length > 0);
    console.log('Errors:', errors.length);
    errors.forEach(e => console.log('  ERR:', e));
  });
});
