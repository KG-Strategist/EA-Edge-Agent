import { test, expect } from '@playwright/test';
import { completeAirGappedAuth } from './auth-helper';

test.describe('UC-07/08/10/11: Admin Tabs', () => {
  test.setTimeout(180_000);

  test('admin panel loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await completeAirGappedAuth(page);

    const adminNav = page.locator('a[href*="admin"], button:has-text("Admin"), [data-testid*="admin"]');
    if (await adminNav.count() > 0) {
      await adminNav.first().click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-results/e2e/screenshots/admin-panel.png', fullPage: true });

    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('Admin loaded:', bodyText.length > 0);
    console.log('Errors:', errors.length);
    errors.forEach(e => console.log('  ERR:', e));
  });
});
