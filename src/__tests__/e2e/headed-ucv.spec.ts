/**
 * EA-NITI Headed E2E — Full Use Case Validation with Screenshots
 *
 * Runs headed on Chromium, walks through every major user flow,
 * and saves a screenshot per use case to test-results/e2e/screenshots/.
 *
 * Usage:
 *   npm run build && node .opencode/harness/bug-harness/serve-target.mjs --target=prod --port=3000 &
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
const BUGS_DIR = path.resolve(process.cwd(), 'test-results', 'e2e', 'reports', 'ucv-bugs');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function screenshot(page: Page, name: string) {
  ensureDir(SCREENSHOTS_DIR);
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.info(`📸 Screenshot: ${filePath}`);
}

const foundBugs: Array<{ id: string; uc: string; title: string; detail: string; screenshot: string }> = [];
let bugCounter = 0;

function reportBug(uc: string, title: string, detail: string, screenshot: string) {
  bugCounter++;
  const id = `UCV-BUG-${String(bugCounter).padStart(3, '0')}`;
  foundBugs.push({ id, uc, title, detail, screenshot });
  console.error(`🐛 [${id}] ${uc}: ${title} — ${detail}`);
}

async function selectAirGappedMode(page: Page) {
  const standaloneButton = page.getByTestId('auth-standalone-2fa');
  if (await standaloneButton.isVisible({ timeout: 2000 }).catch(() => false)) return;

  const modeSelectVisible = await page.getByText('Select Configuration Mode').isVisible({ timeout: 5_000 }).catch(() => false);
  if (!modeSelectVisible) return;

  const airGappedMode = page.locator('button').filter({ hasText: 'Air-Gapped (Isolated)' }).first();
  await airGappedMode.click();
  await page.waitForTimeout(500);
  if (await page.getByText('Select Configuration Mode').isVisible({ timeout: 2000 }).catch(() => false)) {
    await airGappedMode.click();
  }
}

async function navigate(page: Page, view: string, subView?: string) {
  await page.evaluate(({ v, s }) => {
    window.dispatchEvent(new CustomEvent('EA_NAVIGATE', { detail: { view: v, subView: s } }));
  }, { v: view, s: subView || '' });
  await page.waitForTimeout(800);
}

function trackErrors(page: Page, _label: string): () => string[] {
  const errors: string[] = [];
  const handler = (msg: { text: () => string }) => {
    const text = msg.text();
    if (/error|Error|ERR_|panic|uncaught|unhandled/i.test(text)) errors.push(text);
  };
  const pageErrorHandler = (err: Error) => errors.push(`PAGE_ERROR: ${err.message}`);
  page.on('console', handler);
  page.on('pageerror', pageErrorHandler);
  return () => {
    page.off('console', handler);
    page.off('pageerror', pageErrorHandler);
    return errors;
  };
}

function auditDom(page: Page, _label: string): Promise<Array<{ severity: string; message: string }>> {
  return page.evaluate(() => {
    const issues: Array<{ severity: string; message: string }> = [];
    const vw = window.innerWidth;

    document.querySelectorAll('button, input, select, textarea, a[href]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        if ((el as HTMLElement).offsetWidth === 0 && (el as HTMLElement).offsetHeight === 0) return;
        const cls = el.className?.toString() || '';
        const cs = window.getComputedStyle(el);
        const isHidden = el.getAttribute('type') === 'hidden'
          || el.getAttribute('aria-hidden') === 'true'
          || cs.display === 'none'
          || cs.visibility === 'hidden'
          || cls.includes('hidden')
          || cls.includes('scale-0')
          || cls.includes('opacity-0')
          || cls.includes('pointer-events-none');
        if (!isHidden) {
          issues.push({ severity: 'high', message: `Zero-size interactive element: ${el.tagName}#${el.id || cls.slice(0, 40)}` });
        }
      }
    });

    document.querySelectorAll('[data-testid]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 10) {
        issues.push({ severity: 'medium', message: `Element overflows viewport: data-testid=${el.getAttribute('data-testid')} width=${Math.round(r.width)} viewport=${vw}` });
      }
    });

    document.querySelectorAll('[role="dialog"]').forEach(el => {
      if (!el.getAttribute('aria-modal')) {
        issues.push({ severity: 'medium', message: `Modal dialog missing aria-modal: ${el.className?.toString().slice(0, 50)}` });
      }
    });

    return issues;
  }).catch(() => []);
}

async function domSnapshot(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => ({
    dataTestIds: Array.from(document.querySelectorAll('[data-testid]')).map(el => ({
      testId: el.getAttribute('data-testid'),
      tag: el.tagName,
      visible: el.getBoundingClientRect().width > 0,
    })),
    buttons: document.querySelectorAll('button').length,
    inputs: document.querySelectorAll('input').length,
    forms: document.querySelectorAll('form').length,
    heading: document.querySelector('h1,h2')?.textContent?.trim()?.slice(0, 80) || '',
  })).catch(() => ({}));
}

// ═══════════════════════════════════════════════════════════════════════════════
test.describe('EA-NITI Headed E2E — Full Use Case Validation (v1.1.4)', () => {
  test.setTimeout(900_000);

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
      viewport: { width: 1440, height: 900 },
    });
    page = await context.newPage();
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '00-app-load');
  });

  test.afterAll(async () => {
    ensureDir(BUGS_DIR);
    if (foundBugs.length > 0) {
      const md = foundBugs.map(b => `| ${b.id} | ${b.uc} | ${b.title} | ${b.detail} | ${b.screenshot} |`).join('\n');
      fs.writeFileSync(path.join(BUGS_DIR, `ucv-bugs-${Date.now()}.md`),
        `# UCV Bug Report\n\n| ID | UC | Title | Detail | Screenshot |\n|---|---|---|---|---|\n${md}\n`);
    }
    await context?.close();
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-01: Auth Gate — Signup Flow
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-01: Auth gate — signup flow', async () => {
    const stopTracking = trackErrors(page, 'UC-01');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'uc01-01-select-mode');

    await selectAirGappedMode(page);
    await page.waitForTimeout(1000);
    await screenshot(page, 'uc01-02-air-gapped-selected');

    await page.getByTestId('auth-standalone-2fa').click({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await screenshot(page, 'uc01-03-signup-form');

    await page.getByTestId('auth-consent-continue').click();
    await page.waitForTimeout(300);
    await screenshot(page, 'uc01-04-consent-accepted');

    const pseudonym = `e2e-ucv-${Date.now()}`;
    await page.getByTestId('auth-pseudonym').fill(pseudonym);
    await page.getByTestId('auth-passphrase').fill('testpass123');
    await page.getByTestId('auth-pin').fill('123456');
    await page.getByTestId('auth-confirm-pin').fill('123456');
    await page.getByTestId('auth-security-answer-1').fill('answer1');
    await page.getByTestId('auth-security-answer-2').fill('answer2');
    await screenshot(page, 'uc01-05-signup-filled');

    await page.getByTestId('auth-create-vault').click();
    await expect(page.getByTestId('agentchat-open-button')).toBeVisible({ timeout: 60_000 });
    await screenshot(page, 'uc01-06-post-signup-dashboard');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-01', 'Console errors during signup', errors.join(' | '), 'uc01-06');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-02: Dashboard — Main View
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-02: Dashboard — main view after login', async () => {
    const stopTracking = trackErrors(page, 'UC-02');
    await navigate(page, 'dashboard');
    await page.waitForTimeout(1500);
    await screenshot(page, 'uc02-01-dashboard-main');

    const snap = await domSnapshot(page);
    console.info('Dashboard DOM:', JSON.stringify(snap, null, 2));

    const dashboardVisible = await page.getByTestId('dashboard-view').isVisible({ timeout: 5000 }).catch(() => false);
    if (!dashboardVisible) reportBug('UC-02', 'Dashboard view not rendered', 'data-testid=dashboard-view not found', 'uc02-01');

    const domIssues = await auditDom(page, 'UC-02');
    for (const issue of domIssues) reportBug('UC-02', 'DOM issue', issue.message, 'uc02-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-02', 'Console errors', errors.join(' | '), 'uc02-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-03: Agent Chat — Open & Send Message
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-03: Agent chat — open and interact', async () => {
    const stopTracking = trackErrors(page, 'UC-03');
    await page.getByTestId('agentchat-open-button').click();
    await page.waitForTimeout(1000);
    await screenshot(page, 'uc03-01-chat-open');

    const modeSelector = page.getByTestId('agentchat-execution-mode');
    if (await modeSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc03-02-chat-mode-selector');
    }

    const input = page.getByTestId('agentchat-message-input');
    if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await input.fill('Hello, what can you help me with?');
      await screenshot(page, 'uc03-03-chat-message-typed');
      await page.getByTestId('agentchat-send-button').click();
      await page.waitForTimeout(3000);
      await screenshot(page, 'uc03-04-chat-after-send');

      const userMsg = await page.getByTestId('message-user').isVisible({ timeout: 3000 }).catch(() => false);
      if (!userMsg) reportBug('UC-03', 'User message bubble not rendered', 'message-user testid not visible after send', 'uc03-04');
    } else {
      reportBug('UC-03', 'Chat input not visible', 'agentchat-message-input not found', 'uc03-01');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-03', 'Console errors', errors.join(' | '), 'uc03-04');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-04: NSI Workflow — Intake Wizard (via reviews nav)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-04: NSI workflow — intake wizard', async () => {
    const stopTracking = trackErrors(page, 'UC-04');
    await navigate(page, 'reviews');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc04-01-reviews-view');

    const newReviewBtn = page.locator('button').filter({ hasText: /new review|create review|start review|launch wizard|submit/i }).first();
    if (await newReviewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newReviewBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'uc04-02-intake-wizard-open');

      const wizardVisible = await page.getByTestId('intake-wizard-view').isVisible({ timeout: 3000 }).catch(() => false);
      if (!wizardVisible) reportBug('UC-04', 'Intake wizard not rendered', 'intake-wizard-view testid not found after click', 'uc04-02');

      const domIssues = await auditDom(page, 'UC-04');
      for (const issue of domIssues) reportBug('UC-04', 'DOM issue', issue.message, 'uc04-02');
    } else {
      reportBug('UC-04', 'No new review button found', 'Could not find button matching new/create/start review', 'uc04-01');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-04', 'Console errors', errors.join(' | '), 'uc04-02');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-05: Admin — System / State Portability Tab
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-05: Admin panel — system tab (OCR health)', async () => {
    const stopTracking = trackErrors(page, 'UC-05');
    await navigate(page, 'system-pref', 'system');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc05-01-system-tab');

    const ocrWidget = page.locator('text=/OCR|WASM|Engine|Hydrat/i');
    if (await ocrWidget.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc05-02-ocr-health-visible');
    }

    const domIssues = await auditDom(page, 'UC-05');
    for (const issue of domIssues) reportBug('UC-05', 'DOM issue', issue.message, 'uc05-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-05', 'Console errors', errors.join(' | '), 'uc05-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-06: Admin — Model Sandbox
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-06: Admin panel — model sandbox', async () => {
    const stopTracking = trackErrors(page, 'UC-06');
    await navigate(page, 'system-pref', 'models');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc06-01-model-sandbox');

    const sideloadSection = page.locator('[data-testid="model-sandbox-tab"]');
    if (await sideloadSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc06-02-sideload-section');
    } else {
      reportBug('UC-06', 'Model sandbox tab not rendered', 'model-sandbox-tab testid not found', 'uc06-01');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-06', 'Console errors', errors.join(' | '), 'uc06-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-07: Admin — Workflows Tab (agent-config/workflows)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-07: Admin panel — workflow configuration', async () => {
    const stopTracking = trackErrors(page, 'UC-07');
    await navigate(page, 'agent-config', 'workflows');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc07-01-workflow-tab');

    const domainSection = page.locator('text=/Workflow|BIAN|TOGAF|Trigger/i');
    if (await domainSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc07-02-workflow-content');
    }

    const domIssues = await auditDom(page, 'UC-07');
    for (const issue of domIssues) reportBug('UC-07', 'DOM issue', issue.message, 'uc07-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-07', 'Console errors', errors.join(' | '), 'uc07-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-08: Admin — Global Guardrails (system-pref/dpdp)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-08: Admin panel — guardrails configuration', async () => {
    const stopTracking = trackErrors(page, 'UC-08');
    await navigate(page, 'system-pref', 'dpdp');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc08-01-guardrails-tab');

    const guardrailSection = page.locator('text=/Guardrail|Privacy|DPDP|Policy|Enforcement/i');
    if (await guardrailSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc08-02-guardrail-content');
    }

    const domIssues = await auditDom(page, 'UC-08');
    for (const issue of domIssues) reportBug('UC-08', 'DOM issue', issue.message, 'uc08-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-08', 'Console errors', errors.join(' | '), 'uc08-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-09: PWA Offline — Service Worker
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-09: PWA offline — service worker and cache status', async () => {
    const stopTracking = trackErrors(page, 'UC-09');
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        return !!reg;
      }
      return false;
    });
    console.info(`Service worker registered: ${swRegistered}`);
    await screenshot(page, 'uc09-01-pwa-status');

    if (!swRegistered) reportBug('UC-09', 'Service worker not registered', 'No SW registration found', 'uc09-01');

    await context.setOffline(true);
    await page.waitForTimeout(3000);
    await screenshot(page, 'uc09-02-offline-mode');

    await context.setOffline(false);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await screenshot(page, 'uc09-03-back-online');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-09', 'Console errors', errors.join(' | '), 'uc09-03');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-10: Admin — Templates Tab (agent-config/templates)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-10: Admin panel — templates management', async () => {
    const stopTracking = trackErrors(page, 'UC-10');
    await navigate(page, 'agent-config', 'templates');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc10-01-templates-tab');

    const domIssues = await auditDom(page, 'UC-10');
    for (const issue of domIssues) reportBug('UC-10', 'DOM issue', issue.message, 'uc10-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-10', 'Console errors', errors.join(' | '), 'uc10-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-11: Admin — Principles (expert-config/principles)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-11: Admin panel — principles', async () => {
    const stopTracking = trackErrors(page, 'UC-11');
    await navigate(page, 'expert-config', 'principles');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc11-01-principles-tab');

    const domIssues = await auditDom(page, 'UC-11');
    for (const issue of domIssues) reportBug('UC-11', 'DOM issue', issue.message, 'uc11-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-11', 'Console errors', errors.join(' | '), 'uc11-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-12: Admin — Audit Workspace (system-pref/audit)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-12: Audit workspace — telemetry and logs', async () => {
    const stopTracking = trackErrors(page, 'UC-12');
    await navigate(page, 'system-pref', 'audit');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc12-01-audit-workspace');

    const domIssues = await auditDom(page, 'UC-12');
    for (const issue of domIssues) reportBug('UC-12', 'DOM issue', issue.message, 'uc12-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-12', 'Console errors', errors.join(' | '), 'uc12-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-13: Threat Modeling (threat nav)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-13: Threat modeling — STRIDE analysis', async () => {
    const stopTracking = trackErrors(page, 'UC-13');
    await navigate(page, 'threat');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc13-01-threat-modeling');

    const strideSection = page.locator('text=/STRIDE|Spoofing|Tampering|Repudiation|Information Disclosure|Denial|Escalation/i');
    if (await strideSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc13-02-stride-categories');
    }

    const domIssues = await auditDom(page, 'UC-13');
    for (const issue of domIssues) reportBug('UC-13', 'DOM issue', issue.message, 'uc13-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-13', 'Console errors', errors.join(' | '), 'uc13-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-14: Network Integration (system-pref/network)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-14: Admin panel — network integration', async () => {
    const stopTracking = trackErrors(page, 'UC-14');
    await navigate(page, 'system-pref', 'network');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc14-01-network-tab');

    const networkSection = page.locator('text=/Network|Integration|OAuth|Provider|Privacy/i');
    if (await networkSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, 'uc14-02-network-content');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-14', 'Console errors', errors.join(' | '), 'uc14-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-15: Categories + Tags (expert-config/categories + tags)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-15: Admin panel — categories and tags', async () => {
    const stopTracking = trackErrors(page, 'UC-15');
    await navigate(page, 'expert-config', 'categories');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc15-01-categories-tab');

    await navigate(page, 'expert-config', 'tags');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc15-02-tags-tab');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-15', 'Console errors', errors.join(' | '), 'uc15-02');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-16: Invalid View Routing (moe-selector does not exist)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-16: Invalid view routing — moe-selector fallback', async () => {
    const stopTracking = trackErrors(page, 'UC-16');
    await navigate(page, 'moe-selector');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc16-01-moe-selector-invalid');

    const snap = await domSnapshot(page);
    console.info('After invalid route:', JSON.stringify(snap, null, 2));
    const heading = (snap as any)?.heading || '';
    if (heading.toLowerCase().includes('dashboard') || heading.toLowerCase().includes('404')) {
      console.info('Correctly fell back to dashboard for invalid route');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-16', 'Console errors on invalid route', errors.join(' | '), 'uc16-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-17: Login / Vault Unlock (returning user)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-17: Login — vault unlock flow', async () => {
    const stopTracking = trackErrors(page, 'UC-17');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await screenshot(page, 'uc17-01-login-or-unlock');

    const unlockBtn = page.locator('button').filter({ hasText: /unlock|login|sign in|enter/i }).first();
    if (await unlockBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await screenshot(page, 'uc17-02-unlock-form-visible');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-17', 'Console errors', errors.join(' | '), 'uc17-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-18: Architecture Layers Tab (expert-config/layers)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-18: Admin — architecture layers', async () => {
    const stopTracking = trackErrors(page, 'UC-18');
    await navigate(page, 'expert-config', 'layers');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc18-01-layers-tab');

    const domIssues = await auditDom(page, 'UC-18');
    for (const issue of domIssues) reportBug('UC-18', 'DOM issue', issue.message, 'uc18-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-18', 'Console errors', errors.join(' | '), 'uc18-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-19: Metamodel Tab (expert-config/metamodel)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-19: Admin — content metamodel', async () => {
    const stopTracking = trackErrors(page, 'UC-19');
    await navigate(page, 'expert-config', 'metamodel');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc19-01-metamodel-tab');

    const domIssues = await auditDom(page, 'UC-19');
    for (const issue of domIssues) reportBug('UC-19', 'DOM issue', issue.message, 'uc19-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-19', 'Console errors', errors.join(' | '), 'uc19-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-20: Service Domains Tab (expert-config/service-domains)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-20: Admin — service domains', async () => {
    const stopTracking = trackErrors(page, 'UC-20');
    await navigate(page, 'expert-config', 'service-domains');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc20-01-service-domains-tab');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-20', 'Console errors', errors.join(' | '), 'uc20-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-21: Web Providers Tab (knowledge-mgmt/web-providers)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-21: Admin — web providers', async () => {
    const stopTracking = trackErrors(page, 'UC-21');
    await navigate(page, 'knowledge-mgmt', 'web-providers');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc21-01-web-providers-tab');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-21', 'Console errors', errors.join(' | '), 'uc21-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-22: User Access Tab (system-pref/users)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-22: Admin — user access', async () => {
    const stopTracking = trackErrors(page, 'UC-22');
    await navigate(page, 'system-pref', 'users');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc22-01-user-access-tab');

    const domIssues = await auditDom(page, 'UC-22');
    for (const issue of domIssues) reportBug('UC-22', 'DOM issue', issue.message, 'uc22-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-22', 'Console errors', errors.join(' | '), 'uc22-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-23: Agent Config Tab (agent-config/configs)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-23: Admin — agent configurations', async () => {
    const stopTracking = trackErrors(page, 'UC-23');
    await navigate(page, 'agent-config', 'configs');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc23-01-agent-config-tab');

    const agentConfigVisible = await page.getByTestId('agent-config-tab').isVisible({ timeout: 3000 }).catch(() => false);
    if (!agentConfigVisible) reportBug('UC-23', 'Agent config tab not rendered', 'agent-config-tab testid not found', 'uc23-01');

    const domIssues = await auditDom(page, 'UC-23');
    for (const issue of domIssues) reportBug('UC-23', 'DOM issue', issue.message, 'uc23-01');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-23', 'Console errors', errors.join(' | '), 'uc23-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-24: Prompts Tab (agent-config/prompts)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-24: Admin — AI prompts', async () => {
    const stopTracking = trackErrors(page, 'UC-24');
    await navigate(page, 'agent-config', 'prompts');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc24-01-prompts-tab');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-24', 'Console errors', errors.join(' | '), 'uc24-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-25: Knowledge Management (knowledge-mgmt/knowledge)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-25: Admin — enterprise knowledge', async () => {
    const stopTracking = trackErrors(page, 'UC-25');
    await navigate(page, 'knowledge-mgmt', 'knowledge');
    await page.waitForTimeout(2000);
    await screenshot(page, 'uc25-01-knowledge-tab');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-25', 'Console errors', errors.join(' | '), 'uc25-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-26: Theme Toggle
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-26: Theme toggle — light to dark', async () => {
    const stopTracking = trackErrors(page, 'UC-26');
    await navigate(page, 'dashboard');
    await page.waitForTimeout(1000);
    await screenshot(page, 'uc26-01-before-theme-toggle');

    const themeBtn = page.locator('button').filter({ hasText: /dark|light|theme/i }).first();
    if (await themeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'uc26-02-after-theme-toggle');

      const bgColor = await page.evaluate(() => {
        return window.getComputedStyle(document.body).backgroundColor;
      });
      console.info(`Body background after toggle: ${bgColor}`);
    } else {
      reportBug('UC-26', 'Theme toggle button not found', 'No button matching dark/light/theme', 'uc26-01');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-26', 'Console errors', errors.join(' | '), 'uc26-02');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-27: Recovery / Forgot PIN
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-27: Recovery — forgot PIN flow', async () => {
    const stopTracking = trackErrors(page, 'UC-27');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const recoveryBtn = page.locator('button').filter({ hasText: /recover|forgot|reset/i }).first();
    if (await recoveryBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await recoveryBtn.click();
      await page.waitForTimeout(1500);
      await screenshot(page, 'uc27-01-recovery-flow');

      const snap = await domSnapshot(page);
      console.info('Recovery DOM:', JSON.stringify(snap, null, 2));
    } else {
      console.info('No recovery button visible on current auth state — taking screenshot of auth page');
      await screenshot(page, 'uc27-01-auth-state-for-recovery');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-27', 'Console errors', errors.join(' | '), 'uc27-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-28: PIN Setup View
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-28: PIN setup view', async () => {
    const stopTracking = trackErrors(page, 'UC-28');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await screenshot(page, 'uc28-01-auth-for-pin-setup');

    const pinSetupVisible = await page.locator('text=/PIN|pin|Set up/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    console.info(`PIN setup elements visible: ${pinSetupVisible}`);

    const errors = stopTracking();
    if (errors.length) reportBug('UC-28', 'Console errors', errors.join(' | '), 'uc28-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-29: Notification Drawer
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-29: Notification drawer', async () => {
    const stopTracking = trackErrors(page, 'UC-29');
    await navigate(page, 'dashboard');
    await page.waitForTimeout(1000);

    const bellBtn = page.locator('[data-testid="notification-bell"], button').filter({ hasText: /notification|bell|alert/i }).first();
    if (await bellBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await bellBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'uc29-01-notification-drawer');
    } else {
      await screenshot(page, 'uc29-01-no-notification-bell');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-29', 'Console errors', errors.join(' | '), 'uc29-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-30: Network Toggle in Navbar (air-gap switch)
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-30: Network toggle in navbar', async () => {
    const stopTracking = trackErrors(page, 'UC-30');
    await navigate(page, 'dashboard');
    await page.waitForTimeout(1000);
    await screenshot(page, 'uc30-01-before-network-toggle');

    const networkToggle = page.locator('button').filter({ hasText: /offline|online/i }).first();
    if (await networkToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await networkToggle.click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'uc30-02-after-network-toggle');
    } else {
      console.info('Network toggle not visible in current view');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-30', 'Console errors', errors.join(' | '), 'uc30-02');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-31: Sidebar Collapse/Expand
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-31: Sidebar collapse and expand', async () => {
    const stopTracking = trackErrors(page, 'UC-31');
    await navigate(page, 'dashboard');
    await page.waitForTimeout(1000);

    const collapseBtn = page.locator('nav button').filter({ hasText: /<|collapse|expand|chevron/i }).first();
    if (await collapseBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await collapseBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'uc31-01-sidebar-collapsed');

      await collapseBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'uc31-02-sidebar-expanded');
    } else {
      await screenshot(page, 'uc31-01-no-collapse-btn');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-31', 'Console errors', errors.join(' | '), 'uc31-02');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-32: Full Layout Width Audit
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-32: Layout width audit — no horizontal overflow', async () => {
    const stopTracking = trackErrors(page, 'UC-32');
    const views = ['dashboard', 'reviews', 'threat', 'system-pref', 'expert-config', 'agent-config', 'knowledge-mgmt'];
    for (const view of views) {
      await navigate(page, view);
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => {
        const html = document.documentElement;
        const overflowStyle = window.getComputedStyle(html).overflowX;
        if (overflowStyle === 'hidden' || overflowStyle === 'clip') return false;
        return html.scrollWidth > html.clientWidth;
      });
      if (overflow) {
        reportBug('UC-32', `Horizontal overflow on ${view}`, `scrollWidth > clientWidth`, `uc32-${view}`);
      }
      await screenshot(page, `uc32-01-${view}`);
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-32', 'Console errors', errors.join(' | '), 'uc32-general');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-33: Accessibility Audit — all interactive elements
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-33: Accessibility — buttons/inputs have accessible names', async () => {
    const stopTracking = trackErrors(page, 'UC-33');
    await navigate(page, 'dashboard');
    await page.waitForTimeout(1000);

    const a11yIssues = await page.evaluate(() => {
      const issues: string[] = [];
      document.querySelectorAll('button, input, select, textarea').forEach(el => {
        const hasLabel = el.getAttribute('aria-label')
          || el.getAttribute('aria-labelledby')
          || el.getAttribute('title')
          || (el as HTMLInputElement).placeholder
          || el.textContent?.trim();
        if (!hasLabel) {
          issues.push(`${el.tagName}#${el.id || 'no-id'} class="${el.className?.toString().slice(0, 40)}" — no accessible name`);
        }
      });
      return issues;
    });

    for (const issue of a11yIssues.slice(0, 10)) {
      reportBug('UC-33', 'Accessibility: missing accessible name', issue, 'uc33-01');
    }
    console.info(`A11y issues found: ${a11yIssues.length}`);
    if (a11yIssues.length > 0) console.info('First 5:', a11yIssues.slice(0, 5));

    const errors = stopTracking();
    if (errors.length) reportBug('UC-33', 'Console errors', errors.join(' | '), 'uc33-01');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-99: Summary
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-99: Summary — all screenshots and bug report', async () => {
    ensureDir(SCREENSHOTS_DIR);
    const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png')).sort();
    console.info(`\n📸 Total screenshots captured: ${files.length}`);
    for (const f of files) console.info(`  - ${f}`);

    console.info(`\n🐛 Total bugs found: ${foundBugs.length}`);
    for (const b of foundBugs) console.info(`  [${b.id}] ${b.uc}: ${b.title}`);

    expect(files.length).toBeGreaterThan(0);
  });
});
