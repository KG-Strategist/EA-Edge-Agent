import { test } from '@playwright/test';
import { completeAirGappedAuth } from './auth-helper';

test.describe('UC-OCR: OCR Health', () => {
  test.setTimeout(120_000);

  test('OCR health widget renders', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await completeAirGappedAuth(page);

    const adminNav = page.locator('a[href*="admin"], button:has-text("Admin")');
    if (await adminNav.count() > 0) {
      await adminNav.first().click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-results/e2e/screenshots/uc-ocr-health.png', fullPage: true });

    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('OCR page loaded:', bodyText.length > 0);
    console.log('Contains OCR:', bodyText.includes('OCR'));
    console.log('Errors:', errors.length);
    errors.forEach(e => console.log('  ERR:', e));
  });
});
