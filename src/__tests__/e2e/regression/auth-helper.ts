import { type Page } from '@playwright/test';

/**
 * Shared auth helper — navigates through the 5-step air-gapped signup flow.
 */
export async function completeAirGappedAuth(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Step 1: Config mode → Air-Gapped
  const airGapped = page.locator('button:has-text("Air-Gapped")');
  if (await airGapped.count() > 0) {
    await airGapped.first().click();
    await page.waitForTimeout(1500);
  }

  // Step 2: Auth method → Standalone 2FA
  const sfa = page.locator('button:has-text("Standalone 2FA")');
  if (await sfa.count() > 0) {
    await sfa.first().click();
    await page.waitForTimeout(1500);
  }

  // Step 3: Consent → I Understand & Consent
  const consent = page.locator('button:has-text("I Understand")');
  if (await consent.count() > 0) {
    await consent.first().click();
    await page.waitForTimeout(1500);
  }

  // Step 4: Fill identity form
  const pseudonymInput = page.locator('input[placeholder*="pseudonym" i]').first();
  if (await pseudonymInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pseudonymInput.fill('test-agent');
  }

  const passphraseInput = page.locator('input[name="local-passphrase"], input[placeholder*="8 chars" i]').first();
  if (await passphraseInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await passphraseInput.fill('TestPass123!');
  }

  const pinInputs = page.locator('input[placeholder="4-6"]');
  const pinCount = await pinInputs.count();
  for (let i = 0; i < pinCount; i++) {
    await pinInputs.nth(i).fill('123456');
  }

  // Fill security question answers
  const answerInputs = page.locator('input[placeholder*="Answer"]');
  const answerCount = await answerInputs.count();
  for (let i = 0; i < answerCount; i++) {
    await answerInputs.nth(i).fill('test-answer');
  }

  // Step 5: Create Identity & Vault
  const createBtn = page.locator('button:has-text("Create Identity")');
  if (await createBtn.count() > 0) {
    await createBtn.first().click();
    await page.waitForTimeout(3000);
  }
}
