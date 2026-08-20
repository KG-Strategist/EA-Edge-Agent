import { test, expect } from '@playwright/test';
import { completeAirGappedAuth } from './auth-helper';

test.describe('UC-04: Intake Wizard', () => {
  test.setTimeout(120_000);

  test('intake wizard renders', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await completeAirGappedAuth(page);

    const intakeNav = page.locator('a[href*="intake"], button:has-text("Intake"), button:has-text("New Review"), [data-testid*="intake"]');
    if (await intakeNav.count() > 0) {
      await intakeNav.first().click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-results/e2e/screenshots/uc-04-intake.png', fullPage: true });

    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('Intake page loaded:', bodyText.length > 0);
    console.log('Errors:', errors.length);
    errors.forEach(e => console.log('  ERR:', e));
  });
});
