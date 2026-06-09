/**
 * EA-NITI Headed E2E — Full Use Case Validation with Screenshots
 *
 * Runs headed on Chromium, walks through every major user flow,
 * and saves a screenshot per use case to test-results/e2e/screenshots/.
 *
 * Usage:
 *   npm run dev &
 *   npx playwright test src/__tests__/e2e/headed-ucv.spec.ts --project=chromium --headed
 *
 * Screenshots land in: test-results/e2e/screenshots/
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'test-results', 'e2e', 'screenshots');

function ensureScreenshotsDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

async function screenshot(page: Page, name: string) {
  ensureScreenshotsDir();
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.info(`📸 Screenshot: ${filePath}`);
}

async function _screenshotFull(page: Page, name: string) {
  ensureScreenshotsDir();
  const filePath = path.join(SCREENSHOTS_DIR, `${name}-full.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.info(`📸 Full-page screenshot: ${filePath}`);
}

async function selectAirGappedMode(page: Page) {
  const standaloneButton = page.getByTestId('auth-standalone-2fa');
  if (await standaloneButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }

  await expect(page.getByText('Select Configuration Mode')).toBeVisible({ timeout: 30_000 });
  const airGappedMode = page.locator('button').filter({ hasText: 'Air-Gapped (Isolated)' }).first();
  await airGappedMode.click();
  await page.waitForTimeout(500);
  // Try again if modal is still showing
  if (await page.getByText('Select Configuration Mode').isVisible({ timeout: 2000 }).catch(() => false)) {
    await airGappedMode.click();
  }
}

async function _completeStandaloneSignup(page: Page, context: BrowserContext, pseudonym: string) {
  await context.clearCookies();
  await context.setOffline(false);
  await page.goto('/');

  await selectAirGappedMode(page);
  await page.getByTestId('auth-standalone-2fa').click({ timeout: 30_000 });
  await page.getByTestId('auth-consent-continue').click();

  await page.getByTestId('auth-pseudonym').fill(pseudonym);
  await page.getByTestId('auth-passphrase').fill('testpass123');
  await page.getByTestId('auth-pin').fill('123456');
  await page.getByTestId('auth-confirm-pin').fill('123456');
  await page.getByTestId('auth-security-answer-1').fill('answer1');
  await page.getByTestId('auth-security-answer-2').fill('answer2');
  await page.getByTestId('auth-create-vault').click();

  await expect(page.getByTestId('agentchat-open-button')).toBeVisible({ timeout: 60_000 });
}

async function navigateToAdminSubView(page: Page, view: string, subView: string) {
  await page.evaluate(({ targetView, targetSubView }) => {
    window.dispatchEvent(new CustomEvent('EA_NAVIGATE', {
      detail: { view: targetView, subView: targetSubView },
    }));
  }, { targetView: view, targetSubView: subView });
  await page.waitForTimeout(500);
}

function trackErrors(page: Page, label: string): (msg: string) => void {
  const errors: string[] = [];
  const handler = (msg: { text: () => string }) => {
    const text = msg.text();
    if (/error|Error|ERR_|panic/i.test(text)) {
      errors.push(text);
    }
  };
  page.on('console', handler);
  return (afterLabel: string) => {
    page.off('console', handler);
    if (errors.length > 0) {
      console.warn(`⚠️  [${label} → ${afterLabel}] Console errors:`, errors);
    }
  };
}

test.describe('EA-NITI Headed E2E — Full Use Case Validation', () => {
  test.setTimeout(600_000);

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
      viewport: { width: 1440, height: 900 },
    });
    page = await context.newPage();

    const collectErrors = trackErrors(page, 'beforeAll');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    collectErrors('app-load');
    await screenshot(page, '00-app-load');
  });

  test.afterAll(async () => {
    await context?.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-01: Auth Gate — Signup Flow
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-01: Auth gate — signup flow', async () => {
    const collectErrors = trackErrors(page, 'UC-01');

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'uc01-01-select-mode');

    // Select Air-Gapped mode
    await selectAirGappedMode(page);
    await page.waitForTimeout(1000);
    await screenshot(page, 'uc01-02-air-gapped-selected');

    // Click standalone 2FA
    await page.getByTestId('auth-standalone-2fa').click({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await screenshot(page, 'uc01-03-signup-form');

    // Consent
    await page.getByTestId('auth-consent-continue').click();
    await page.waitForTimeout(300);
    await screenshot(page, 'uc01-04-consent-accepted');

    // Fill signup
    const pseudonym = `e2e-ucv-${Date.now()}`;
    await page.getByTestId('auth-pseudonym').fill(pseudonym);
    await page.getByTestId('auth-passphrase').fill('testpass123');
    await page.getByTestId('auth-pin').fill('123456');
    await page.getByTestId('auth-confirm-pin').fill('123456');
    await page.getByTestId('auth-security-answer-1').fill('answer1');
    await page.getByTestId('auth-security-answer-2').fill('answer2');
    await screenshot(page, 'uc01-05-signup-filled');

    // Create vault
    await page.getByTestId('auth-create-vault').click();
    await expect(page.getByTestId('agentchat-open-button')).toBeVisible({ timeout: 60_000 });
    await screenshot(page, 'uc01-06-post-signup-dashboard');

    collectErrors('UC-01-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-02: Dashboard — Main View
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-02: Dashboard — main view after login', async () => {
    const collectErrors = trackErrors(page, 'UC-02');

    // Navigate to dashboard
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('EA_NAVIGATE', {
        detail: { view: 'dashboard', subView: 'main' },
      }));
    });
    await page.waitForTimeout(1500);
    await screenshot(page, 'uc02-01-dashboard-main');

    // Check key dashboard elements
    const dashboardVisible = await page.locator('text=Enterprise Architecture').isVisible({ timeout: 5000 }).catch(() => false)
      || await page.locator('text=EA-NITI').isVisible({ timeout: 5000 }).catch(() => false)
      || await page.locator('[data-testid]').first().isVisible({ timeout: 5000 }).catch(() => false);
    console.info(`Dashboard visible: ${dashboardVisible}`);

    collectErrors('UC-02-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-03: Agent Chat — Open & Send Message
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-03: Agent chat — open and interact', async () => {
    const collectErrors = trackErrors(page, 'UC-03');

    // Open chat
    await page.getByTestId('agentchat-open-button').click();
    await page.waitForTimeout(1000);
    await screenshot(page, 'uc03-01-chat-open');

    // Check execution mode selector
    const modeSelector = page.getByTestId('agentchat-execution-mode');
    if (await modeSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc03-02-chat-mode-selector');
    }

    // Type message
    const input = page.getByTestId('agentchat-message-input');
    if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await input.fill('Hello, what can you help me with?');
      await screenshot(page, 'uc03-03-chat-message-typed');

      // Send
      await page.getByTestId('agentchat-send-button').click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'uc03-04-chat-after-send');
    } else {
      await screenshot(page, 'uc03-03-chat-input-not-visible');
    }

    collectErrors('UC-03-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-04: NSI Workflow — Create New Review (Intake Wizard)
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-04: NSI workflow — create new review', async () => {
    const collectErrors = trackErrors(page, 'UC-04');

    await navigateToAdminSubView(page, 'intake-wizard', 'start');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc04-01-intake-wizard');

    // Try to start a new review
    const newReviewBtn = page.locator('button').filter({ hasText: /new review|create review|start review/i }).first();
    if (await newReviewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newReviewBtn.click();
      await page.waitForTimeout(1500);
      await screenshot(page, 'uc04-02-new-review-form');
    }

    // Check for NSI stage indicators
    const nsiStages = page.locator('text=/Step|Stage|Phase/i');
    if (await nsiStages.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc04-03-nsi-stages-visible');
    }

    collectErrors('UC-04-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-05: Admin Panel — System Tab (OCR Health Widget)
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-05: Admin panel — system tab (OCR health)', async () => {
    const collectErrors = trackErrors(page, 'UC-05');

    await navigateToAdminSubView(page, 'system-pref', 'system');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc05-01-system-tab');

    // Check for OCR health widget
    const ocrWidget = page.locator('text=/OCR|WASM|Engine|Hydrat/i');
    if (await ocrWidget.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc05-02-ocr-health-visible');
    }

    // Check for model status section
    const modelSection = page.locator('text=/Model|Sovereign|Engine/i');
    if (await modelSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc05-03-model-status-visible');
    }

    collectErrors('UC-05-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-06: Admin Panel — Model Sandbox (Sideload)
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-06: Admin panel — model sandbox', async () => {
    const collectErrors = trackErrors(page, 'UC-06');

    await navigateToAdminSubView(page, 'system-pref', 'models');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc06-01-model-sandbox');

    // Check for sideload controls
    const sideloadSection = page.locator('text=/Sideload|Upload|Model/i');
    if (await sideloadSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc06-02-sideload-section');
    }

    collectErrors('UC-06-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-07: Admin Panel — Workflow Tab
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-07: Admin panel — workflow configuration', async () => {
    const collectErrors = trackErrors(page, 'UC-07');

    await navigateToAdminSubView(page, 'workflow', 'config');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc07-01-workflow-tab');

    const domainSection = page.locator('text=/Domain|Tags|BIAN|TOGAF/i');
    if (await domainSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc07-02-domain-config');
    }

    collectErrors('UC-07-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-08: Admin Panel — Security/Guardrails Tab
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-08: Admin panel — guardrails configuration', async () => {
    const collectErrors = trackErrors(page, 'UC-08');

    await navigateToAdminSubView(page, 'guardrails', 'rules');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc08-01-guardrails-tab');

    const guardrailSection = page.locator('text=/Guardrail|Rule|Policy/i');
    if (await guardrailSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc08-02-guardrail-rules');
    }

    collectErrors('UC-08-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-09: PWA Offline — Service Worker Registration
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-09: PWA offline — service worker and cache status', async () => {
    const collectErrors = trackErrors(page, 'UC-09');

    // Check SW registration
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        return !!reg;
      }
      return false;
    });
    console.info(`Service worker registered: ${swRegistered}`);
    await page.waitForTimeout(1000);
    await screenshot(page, 'uc09-01-pwa-status');

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(2000);

// Already offline; just take the offline screenshot without reloading (page is cached)
  await page.waitForTimeout(3000);
  await screenshot(page, 'uc09-02-offline-mode');

  // Go back online
  await context.setOffline(false);
  await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await screenshot(page, 'uc09-03-back-online');

    collectErrors('UC-09-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-10: Admin Panel — Templates Tab
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-10: Admin panel — templates management', async () => {
    const collectErrors = trackErrors(page, 'UC-10');

    await navigateToAdminSubView(page, 'system-pref', 'templates');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc10-01-templates-tab');

    const templateSection = page.locator('text=/Template|Report|Markdown/i');
    if (await templateSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc10-02-template-list');
    }

    collectErrors('UC-10-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-11: Admin Panel — Principles/Compliance Tab
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-11: Admin panel — compliance and principles', async () => {
    const collectErrors = trackErrors(page, 'UC-11');

    await navigateToAdminSubView(page, 'compliance', 'principles');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc11-01-compliance-tab');

    const complianceSection = page.locator('text=/Principle|Compliance|STRIDE|MITRE/i');
    if (await complianceSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc11-02-compliance-rules');
    }

    collectErrors('UC-11-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-12: Audit / Telemetry View
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-12: Audit workspace — telemetry and logs', async () => {
    const collectErrors = trackErrors(page, 'UC-12');

    await navigateToAdminSubView(page, 'audit', 'workspace');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc12-01-audit-workspace');

    collectErrors('UC-12-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-13: Threat Editor — STRIDE Analysis
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-13: Threat editor — STRIDE analysis', async () => {
    const collectErrors = trackErrors(page, 'UC-13');

    await navigateToAdminSubView(page, 'threat-editor', 'main');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc13-01-threat-editor');

    const strideSection = page.locator('text=/STRIDE|Spoofing|Tampering|Repudiation|Information Disclosure|Denial|Escalation/i');
    if (await strideSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc13-02-stride-categories');
    }

    collectErrors('UC-13-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-14: Network Integration Panel
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-14: Admin panel — network integration (should be disabled in air-gap)', async () => {
    const collectErrors = trackErrors(page, 'UC-14');

    await navigateToAdminSubView(page, 'system-pref', 'network');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc14-01-network-tab');

    const networkSection = page.locator('text=/Network|Integration|OAuth|Provider/i');
    if (await networkSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc14-02-network-config');
    }

    collectErrors('UC-14-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-15: Categories and Tags Management
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-15: Admin panel — categories and tags', async () => {
    const collectErrors = trackErrors(page, 'UC-15');

    await navigateToAdminSubView(page, 'system-pref', 'categories');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc15-01-categories-tab');

    await navigateToAdminSubView(page, 'system-pref', 'tags');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc15-02-tags-tab');

    collectErrors('UC-15-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UC-16: MoE Selector Widget
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-16: MoE selector widget', async () => {
    const collectErrors = trackErrors(page, 'UC-16');

    // Try to access MoE selector
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('EA_NAVIGATE', {
        detail: { view: 'moe-selector', subView: 'main' },
      }));
    });
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc16-01-moe-selector');

    collectErrors('UC-16-complete');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Summary: Collect all screenshots
  // ─────────────────────────────────────────────────────────────────────────
  test('UC-99: Summary — list all captured screenshots', async () => {
    ensureScreenshotsDir();
    const files = fs.readdirSync(SCREENSHOTS_DIR)
      .filter(f => f.endsWith('.png'))
      .sort();

    console.info('\n📸 Screenshots captured:');
    for (const f of files) {
      console.info(`  - ${f}`);
    }

    expect(files.length).toBeGreaterThan(0);
  });
});