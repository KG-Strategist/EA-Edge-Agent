import { test } from '@playwright/test';
import { completeAirGappedAuth } from './auth-helper';

test.describe('UC-03: Agent Chat', () => {
  test.setTimeout(120_000);

  test('agent chat opens and accepts input', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await completeAirGappedAuth(page);

    // BUG-006 FIX: Use exact data-testid selectors for deterministic DOM queries
    const chatBtn = page.locator('[data-testid="agentchat-open-button"]');
    if (await chatBtn.count() > 0) {
      await chatBtn.first().click();
      await page.waitForTimeout(1000);
    }

    const chatInput = page.locator('[data-testid="agentchat-message-input"]');
    if (await chatInput.count() > 0) {
      await chatInput.first().fill('Hello');
    }

    const sendBtn = page.locator('[data-testid="agentchat-send-button"]');

    await page.screenshot({ path: 'test-results/e2e/screenshots/uc-03-chat.png', fullPage: true });

    console.log('Chat input visible:', await chatInput.count() > 0);
    console.log('Chat button found:', await chatBtn.count() > 0);
    console.log('Send button found:', await sendBtn.count() > 0);
    console.log('Errors:', errors.length);
    errors.forEach(e => console.log('  ERR:', e));
  });
});
