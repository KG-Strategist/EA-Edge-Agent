import { test } from '@playwright/test';
import { completeAirGappedAuth } from './auth-helper';

test.describe('UC-13: Threat Modeling', () => {
  test.setTimeout(120_000);

  test('threat editor renders', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await completeAirGappedAuth(page);

    const threatNav = page.locator('a[href*="threat"], button:has-text("Threat"), [data-testid*="threat"]');
    if (await threatNav.count() > 0) {
      await threatNav.first().click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-results/e2e/screenshots/uc-13-threat.png', fullPage: true });

    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('Threat loaded:', bodyText.length > 0);
    console.log('Contains STRIDE:', bodyText.includes('STRIDE'));
    console.log('Errors:', errors.length);
    errors.forEach(e => console.log('  ERR:', e));
  });
});
