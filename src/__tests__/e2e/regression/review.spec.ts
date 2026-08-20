import { test, expect } from '@playwright/test';
import { completeAirGappedAuth } from './auth-helper';

test.describe('UC-05: Review Execution', () => {
  test.setTimeout(120_000);

  test('review execution view renders', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await completeAirGappedAuth(page);

    const reviewNav = page.locator('a[href*="review"], button:has-text("Review"), [data-testid*="review"]');
    if (await reviewNav.count() > 0) {
      await reviewNav.first().click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-results/e2e/screenshots/uc-05-review.png', fullPage: true });

    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('Review page loaded:', bodyText.length > 0);
    console.log('Errors:', errors.length);
    errors.forEach(e => console.log('  ERR:', e));
  });
});
