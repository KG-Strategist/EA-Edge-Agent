/**
 * EA-NITI Headed E2E — v1.2 Use Case Validation (UC-40 … UC-45)
 *
 * Validates the four v1.2 milestones in a real headed browser:
 *   M1 Encrypted Payloads  (UC-41: encrypted export, UC-42: import round-trip)
 *   M2 Selective Syncing   (UC-40: entity-group selection UI)
 *   M3 Device Biometrics   (UC-43: WebAuthn virtual-authenticator ceremony)
 *   M4 NITI-Pedia          (UC-44: wiki CRUD + ask overlay)
 *   UC-45: overflow + a11y sweep over the touched views (regression guard)
 *
 * Usage:
 *   npm run build && node .opencode/harness/bug-harness/serve-target.mjs --target=prod --port=3000 &
 *   npx playwright test src/__tests__/e2e/headed-v12-ucv.spec.ts --project=chromium --headed
 *
 * Screenshots land in: test-results/e2e/screenshots/ (v12-* prefix)
 * Bug reports land in:  test-results/e2e/reports/ucv-bugs/ (v12-ucv-bugs-*.md)
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'test-results', 'e2e', 'screenshots');
const BUGS_DIR = path.resolve(process.cwd(), 'test-results', 'e2e', 'reports', 'ucv-bugs');
const DOWNLOADS_DIR = path.resolve(process.cwd(), 'test-results', 'e2e', 'downloads');

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

function reportBug(uc: string, title: string, detail: string, shot: string) {
  bugCounter++;
  const id = `V12-BUG-${String(bugCounter).padStart(3, '0')}`;
  foundBugs.push({ id, uc, title, detail, screenshot: shot });
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
}

async function navigate(page: Page, view: string, subView?: string) {
  await page.evaluate(({ v, s }) => {
    window.dispatchEvent(new CustomEvent('EA_NAVIGATE', { detail: { view: v, subView: s } }));
  }, { v: view, s: subView || '' });
  await page.waitForTimeout(800);
}

function trackErrors(page: Page, _label: string, ignorePatterns: RegExp[] = []): () => string[] {
  const errors: string[] = [];
  const handler = (msg: { text: () => string }) => {
    const text = msg.text();
    if (/error|Error|ERR_|panic|uncaught|unhandled/i.test(text)) {
      if (ignorePatterns.some(p => p.test(text))) return;
      errors.push(text);
    }
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
    return issues;
  }).catch(() => []);
}

// ═══════════════════════════════════════════════════════════════════════════════
test.describe('EA-NITI Headed E2E — v1.2 Validation (UC-40 … UC-45)', () => {
  test.setTimeout(900_000);

  let context: BrowserContext;
  let page: Page;
  let encryptedExportPath = '';

  test.beforeAll(async ({ browser }) => {
    ensureDir(DOWNLOADS_DIR);
    context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    page = await context.newPage();
    // Auto-accept confirm() dialogs (import merge + wiki delete flows use them)
    page.on('dialog', d => d.accept().catch(() => undefined));
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'v12-00-app-load');
  });

  test.afterAll(async () => {
    ensureDir(BUGS_DIR);
    if (foundBugs.length > 0) {
      const md = foundBugs.map(b => `| ${b.id} | ${b.uc} | ${b.title} | ${b.detail} | ${b.screenshot} |`).join('\n');
      fs.writeFileSync(path.join(BUGS_DIR, `v12-ucv-bugs-${Date.now()}.md`),
        `# v1.2 UCV Bug Report\n\n| ID | UC | Title | Detail | Screenshot |\n|---|---|---|---|---|\n${md}\n`);
    }
    console.info(`🐛 Total v1.2 bugs found: ${foundBugs.length}`);
    for (const b of foundBugs) console.info(`  [${b.id}] ${b.uc}: ${b.title}`);
    await context?.close();
  });

  // ── Auth preamble: fresh vault (vault unlocked ⇒ encrypted export path) ──
  test('UC-40-pre: signup for v1.2 validation', async () => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await selectAirGappedMode(page);
    await page.waitForTimeout(1000);
    await page.getByTestId('auth-standalone-2fa').click({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.getByTestId('auth-consent-continue').click();
    await page.waitForTimeout(300);
    await page.getByTestId('auth-pseudonym').fill(`e2e-v12-${Date.now()}`);
    await page.getByTestId('auth-passphrase').fill('testpass123');
    await page.getByTestId('auth-pin').fill('123456');
    await page.getByTestId('auth-confirm-pin').fill('123456');
    await page.getByTestId('auth-security-answer-1').fill('answer1');
    await page.getByTestId('auth-security-answer-2').fill('answer2');
    await page.getByTestId('auth-create-vault').click();
    await expect(page.getByTestId('agentchat-open-button')).toBeVisible({ timeout: 60_000 });
    await screenshot(page, 'v12-01-post-signup');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-40: M2 Selective Syncing — entity-group selection UI
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-40: selective export — entity groups UI', async () => {
    const stopTracking = trackErrors(page, 'UC-40');
    await navigate(page, 'system-pref', 'system');
    await page.waitForTimeout(2000);
    await screenshot(page, 'v12-40-01-system-portability');

    for (const group of ['Taxonomy', 'Architecture', 'Templates', 'Configuration']) {
      const visible = await page.getByText(group, { exact: false }).first().isVisible({ timeout: 5000 }).catch(() => false);
      if (!visible) reportBug('UC-40', `Entity group missing: ${group}`, 'group label not rendered', 'v12-40-01-system-portability');
    }

    const counter = page.getByText(/Entities to export \(\d+\/\d+\)/);
    if (!await counter.isVisible({ timeout: 5000 }).catch(() => false)) {
      reportBug('UC-40', 'Selection counter missing', 'Entities to export (n/m) not rendered', 'v12-40-01-system-portability');
    } else {
      console.info('Selection counter:', await counter.textContent());
    }

    // Clear → counter 0/N → Select all → back to N/N
    await page.getByText('Clear', { exact: true }).click();
    await page.waitForTimeout(500);
    const cleared = await page.getByText(/Entities to export \(0\/\d+\)/).isVisible({ timeout: 5000 }).catch(() => false);
    if (!cleared) reportBug('UC-40', 'Clear selection broken', 'counter did not reach 0/N', 'v12-40-02-cleared');
    await screenshot(page, 'v12-40-02-cleared');

    await page.getByText('Select all', { exact: true }).click();
    await page.waitForTimeout(500);
    const restored = await page.getByText(/Entities to export \(\d+\/\d+\)/).isVisible({ timeout: 5000 }).catch(() => false);
    if (!restored) reportBug('UC-40', 'Select-all broken', 'counter did not restore', 'v12-40-03-restored');
    const restoredText = await page.getByText(/Entities to export \(\d+\/\d+\)/).textContent().catch(() => '');
    if (restoredText && /^Entities to export \(0\//.test(restoredText || '')) {
      reportBug('UC-40', 'Select-all left counter at zero', String(restoredText), 'v12-40-03-restored');
    }
    await screenshot(page, 'v12-40-03-restored');

    // Uncheck one group → counter decreases by group size
    const before = await page.getByText(/Entities to export \(\d+\/\d+\)/).textContent().catch(() => '');
    await page.getByLabel('Taxonomy group').click();
    await page.waitForTimeout(500);
    const after = await page.getByText(/Entities to export \(\d+\/\d+\)/).textContent().catch(() => '');
    console.info(`Group toggle: ${before} → ${after}`);
    if (before === after) reportBug('UC-40', 'Group toggle inert', `counter unchanged: ${before}`, 'v12-40-04-group-toggle');
    await screenshot(page, 'v12-40-04-group-toggle');
    // Re-select for downstream UCs
    await page.getByText('Select all', { exact: true }).click();
    await page.waitForTimeout(500);

    const domIssues = await auditDom(page, 'UC-40');
    for (const issue of domIssues) reportBug('UC-40', 'DOM issue', issue.message, 'v12-40-03-restored');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-40', 'Console errors', errors.join(' | '), 'v12-40-03-restored');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-41: M1 Encrypted Payloads — encrypted export file
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-41: encrypted brain export downloads envelope', async () => {
    const stopTracking = trackErrors(page, 'UC-41');
    await navigate(page, 'system-pref', 'system');
    await page.waitForTimeout(2000);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByText('Export Knowledge Base', { exact: true }).click(),
    ]);
    const fileName = download.suggestedFilename();
    console.info('Downloaded:', fileName);
    if (!fileName.endsWith('.enc.json')) {
      reportBug('UC-41', 'Export not encrypted', `expected .enc.json, got ${fileName}`, 'v12-41-01-export');
    }
    encryptedExportPath = path.join(DOWNLOADS_DIR, fileName);
    await download.saveAs(encryptedExportPath);
    await screenshot(page, 'v12-41-01-export');

    let envelope: any = null;
    try {
      envelope = JSON.parse(fs.readFileSync(encryptedExportPath, 'utf8'));
    } catch {
      reportBug('UC-41', 'Export not valid JSON', fileName, 'v12-41-01-export');
    }
    if (envelope) {
      if (envelope.format !== 'niti-brain-encrypted') {
        reportBug('UC-41', 'Missing envelope format', `format=${String(envelope.format)}`, 'v12-41-01-export');
      }
      if (envelope.version !== 1) {
        reportBug('UC-41', 'Wrong envelope version', `version=${String(envelope.version)}`, 'v12-41-01-export');
      }
      if (!Array.isArray(envelope.tables) || envelope.tables.length === 0) {
        reportBug('UC-41', 'Envelope tables empty', JSON.stringify(Object.keys(envelope)), 'v12-41-01-export');
      }
      if (typeof envelope.payload !== 'string' || !envelope.payload.includes(':')) {
        reportBug('UC-41', 'Envelope payload malformed', 'payload missing iv:cipher shape', 'v12-41-01-export');
      }
      if ('architecture_principles' in envelope || 'prompt_templates' in envelope) {
        reportBug('UC-41', 'Plaintext leak in envelope', 'dump keys visible at top level', 'v12-41-01-export');
      }
      console.info(`Envelope OK: ${envelope.tables?.length} tables, payload ${envelope.payload?.length} chars`);
    }

    const toast = page.getByText(/Export Complete: Encrypted payload/);
    if (!await toast.isVisible({ timeout: 5000 }).catch(() => false)) {
      reportBug('UC-41', 'Encrypted-export toast missing', 'expected AES-256-GCM confirmation', 'v12-41-01-export');
    }

    const errors = stopTracking();
    if (errors.length) reportBug('UC-41', 'Console errors', errors.join(' | '), 'v12-41-01-export');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-42: M1+M2 Import — encrypted round-trip + tamper rejection
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-42: encrypted import round-trips, tampered file rejected', async () => {
    const stopTracking = trackErrors(page, 'UC-42', [/Failed to decrypt string/i, /Brain payload decryption failed/i]);
    if (!encryptedExportPath || !fs.existsSync(encryptedExportPath)) {
      reportBug('UC-42', 'No export from UC-41', 'skipping import round-trip', 'v12-42-00-missing-export');
      return;
    }
    await navigate(page, 'system-pref', 'system');
    await page.waitForTimeout(2000);

    // Valid envelope → success path reloads the page
    const reloaded = page.waitForEvent('load', { timeout: 30_000 }).then(() => true).catch(() => false);
    await page.locator('#import-upload').setInputFiles(encryptedExportPath);
    if (!await reloaded) {
      const banner = await page.getByText('Import Aborted').isVisible({ timeout: 5000 }).catch(() => false);
      reportBug('UC-42', 'Valid encrypted import failed', banner ? 'error banner shown' : 'no reload, no banner', 'v12-42-01-import');
    } else {
      console.info('Valid import triggered app reload (success path)');
    }
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(2000);
    await screenshot(page, 'v12-42-01-post-import');

    // Tampered envelope → localized error banner, no reload
    await navigate(page, 'system-pref', 'system');
    await page.waitForTimeout(2000);
    const raw = JSON.parse(fs.readFileSync(encryptedExportPath, 'utf8'));
    raw.payload = raw.payload.slice(0, -1) + (raw.payload.endsWith('0') ? '1' : '0');
    const tamperedPath = path.join(DOWNLOADS_DIR, 'tampered.enc.json');
    fs.writeFileSync(tamperedPath, JSON.stringify(raw));
    await page.locator('#import-upload').setInputFiles(tamperedPath);
    await page.waitForTimeout(2000);
    const aborted = await page.getByText('Import Aborted').isVisible({ timeout: 10_000 }).catch(() => false);
    if (!aborted) {
      reportBug('UC-42', 'Tampered payload not rejected', 'no Import Aborted banner', 'v12-42-02-tampered');
    }
    await screenshot(page, 'v12-42-02-tampered');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-42', 'Console errors', errors.join(' | '), 'v12-42-02-tampered');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-43: M3 Device Biometrics — virtual-authenticator ceremony
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-43: device biometrics register/remove (or graceful fallback)', async () => {
    const stopTracking = trackErrors(page, 'UC-43');
    await navigate(page, 'system-pref', 'system');
    await page.waitForTimeout(2000);
    await screenshot(page, 'v12-43-01-device-card');

    const cardVisible = await page.getByText('Device Biometrics').isVisible({ timeout: 5000 }).catch(() => false);
    if (!cardVisible) {
      reportBug('UC-43', 'Device Biometrics card missing', 'SystemTab card not rendered', 'v12-43-01-device-card');
      return;
    }

    // Virtual authenticator via CDP (headed Chromium has no real platform auth)
    let virtualAuth = false;
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
        },
      });
      virtualAuth = true;
      console.info('Virtual authenticator attached');
    } catch (e: any) {
      console.info('Virtual authenticator unavailable:', e?.message || e);
    }

    if (!virtualAuth) {
      const unsupported = await page.getByText(/not supported in this browser/i).isVisible({ timeout: 5000 }).catch(() => false);
      if (!unsupported) reportBug('UC-43', 'No graceful fallback', 'neither card state rendered', 'v12-43-01-device-card');
      return;
    }

    await page.getByLabel('Register device biometrics').click();
    const registered = await page.getByText('Device registered').isVisible({ timeout: 30_000 }).catch(() => false);
    if (!registered) {
      // PRF may be absent on virtual authenticators — graceful error is acceptable, crash is not
      const notif = await page.getByText(/PRF|not.*return|failed/i).first().isVisible({ timeout: 5000 }).catch(() => false);
      console.info(`PRF ceremony outcome: graceful-error-shown=${notif}`);
      if (!notif) reportBug('UC-43', 'Registration hung silently', 'no badge and no error surfaced', 'v12-43-02-register');
      await screenshot(page, 'v12-43-02-register-fallback');
    } else {
      console.info('Device registration succeeded via virtual authenticator');
      await screenshot(page, 'v12-43-02-registered');
      await page.getByLabel('Remove device biometrics').click();
      await page.waitForTimeout(1000);
      const removed = await page.getByLabel('Register device biometrics').isVisible({ timeout: 10_000 }).catch(() => false);
      if (!removed) reportBug('UC-43', 'Device removal broken', 'register button did not return', 'v12-43-03-removed');
      await screenshot(page, 'v12-43-03-removed');
    }

    const errors = stopTracking().filter(e => !/PRF|WebAuthn|authenticator/i.test(e));
    if (errors.length) reportBug('UC-43', 'Console errors (non-WebAuthn)', errors.join(' | '), 'v12-43-03-removed');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-44: M4 NITI-Pedia — wiki CRUD + ask overlay
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-44: wiki create, ask, edit, delete', async () => {
    const stopTracking = trackErrors(page, 'UC-44');
    await navigate(page, 'knowledge-mgmt', 'knowledge');
    await page.waitForTimeout(2000);
    await screenshot(page, 'v12-44-01-knowledge');

    const header = await page.getByText('NITI-Pedia (Autonomous Edge Wiki)').isVisible({ timeout: 10_000 }).catch(() => false);
    if (!header) {
      reportBug('UC-44', 'WikiTab missing from knowledge view', 'NITI-Pedia header not rendered', 'v12-44-01-knowledge');
      return;
    }

    // Create
    await page.getByLabel('Create wiki page').click();
    await page.getByLabel('Wiki page title').fill('Sovereign Inference E2E Probe');
    await page.getByLabel('Wiki page body').fill('The sovereign tensor core runs GGUF models locally via WASM SIMD for air-gapped inference.');
    await page.getByLabel('Save wiki page').click();
    // Wait for save to complete: success toast OR pages count updates to (1)
    const saveComplete = Promise.race([
      page.getByText(/saved to OPFS/i).waitFor({ timeout: 15_000 }).then(() => 'toast'),
      page.getByText('Pages (1)').waitFor({ timeout: 15_000 }).then(() => 'count'),
    ]).catch(() => '');
    const saveResult = await saveComplete;
    console.info(`UC-44 save completed via: ${saveResult}`);
    await page.waitForTimeout(300);
    const listed = await page.getByText('Pages (1)').isVisible({ timeout: 3000 }).catch(() => false);
    if (!listed) reportBug('UC-44', 'Wiki create failed', 'page not listed after save', 'v12-44-02-created');
    await screenshot(page, 'v12-44-02-created');

    // Ask overlay → ranked hit with excerpt
    await page.getByLabel('Ask the wiki').fill('sovereign tensor WASM inference');
    await page.getByLabel('Search wiki').click();
    const hit = await page.getByText('Sovereign Inference E2E Probe').nth(1).isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hit) reportBug('UC-44', 'Ask overlay returned no hit', 'expected ranked excerpt', 'v12-44-03-ask');
    await screenshot(page, 'v12-44-03-ask');

    // Copy context button appears with hits
    const copyBtn = await page.getByLabel('Copy wiki context for chat').isVisible({ timeout: 5000 }).catch(() => false);
    if (!copyBtn) reportBug('UC-44', 'Copy-context missing', 'button not shown with hits', 'v12-44-03-ask');

    // Edit
    await page.getByLabel('Edit Sovereign Inference E2E Probe').click();
    await page.getByLabel('Wiki page body').fill('Edited body: sovereign WASM SIMD inference remains air-gapped.');
    await page.getByLabel('Save wiki page').click();
    await page.waitForTimeout(1000);
    await screenshot(page, 'v12-44-04-edited');

    // Delete (dialog auto-accepted)
    await page.getByLabel('Delete Sovereign Inference E2E Probe').click();
    await page.waitForTimeout(1500);
    const gone = await page.getByText('Sovereign Inference E2E Probe').isVisible({ timeout: 5000 }).catch(() => false);
    if (gone) reportBug('UC-44', 'Wiki delete failed', 'page still listed', 'v12-44-05-deleted');
    await screenshot(page, 'v12-44-05-deleted');

    const domIssues = await auditDom(page, 'UC-44');
    for (const issue of domIssues) reportBug('UC-44', 'DOM issue', issue.message, 'v12-44-05-deleted');

    const errors = stopTracking();
    if (errors.length) reportBug('UC-44', 'Console errors', errors.join(' | '), 'v12-44-05-deleted');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // UC-45: regression sweep — overflow + a11y on v1.2-touched views
  // ═════════════════════════════════════════════════════════════════════════════
  test('UC-45: layout + accessibility sweep (system, knowledge)', async () => {
    const stopTracking = trackErrors(page, 'UC-45');
    for (const [view, sub, shot] of [
      ['system-pref', 'system', 'v12-45-01-system'],
      ['knowledge-mgmt', 'knowledge', 'v12-45-02-knowledge'],
    ] as Array<[string, string, string]>) {
      await navigate(page, view, sub);
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => {
        const html = document.documentElement;
        const style = window.getComputedStyle(html).overflowX;
        if (style === 'hidden' || style === 'clip') return false;
        return html.scrollWidth > html.clientWidth;
      });
      if (overflow) reportBug('UC-45', `Horizontal overflow on ${sub}`, 'scrollWidth > clientWidth', shot);
      const missingNames: string[] = await page.evaluate(() => {
        const bad: string[] = [];
        document.querySelectorAll('button').forEach(b => {
          const r = b.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          const name = (b.getAttribute('aria-label') || b.textContent || '').trim();
          const cs = window.getComputedStyle(b);
          if (!name && cs.display !== 'none' && cs.visibility !== 'hidden') {
            bad.push(b.className?.toString().slice(0, 50) || b.tagName);
          }
        });
        return bad;
      }).catch(() => []);
      for (const m of missingNames.slice(0, 5)) reportBug('UC-45', 'Button without accessible name', m, shot);
      const domIssues = await auditDom(page, 'UC-45');
      for (const issue of domIssues) reportBug('UC-45', 'DOM issue', `${sub}: ${issue.message}`, shot);
      await screenshot(page, shot);
    }
    const errors = stopTracking();
    if (errors.length) reportBug('UC-45', 'Console errors', errors.join(' | '), 'v12-45-02-knowledge');
  });

  test('UC-99: v1.2 summary', async () => {
    console.info(`v1.2 UCV complete. Bugs: ${foundBugs.length}`);
  });
});
