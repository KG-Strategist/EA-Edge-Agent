#!/usr/bin/env node
/**
 * gate-runner.mjs — Runs the 8-step CI gate in order.
 * Returns structured result per gate and overall pass/fail.
 * Designed to be called by graph-loop.mjs or standalone.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATE_CONFIG = JSON.parse(
  readFileSync(resolve(__dirname, 'rules/gate-order.json'), 'utf8')
);

const SECURITY = JSON.parse(
  readFileSync(resolve(__dirname, 'rules/security-invariants.json'), 'utf8')
);

/**
 * Run a single gate command and capture result.
 */
function runGate(gate, env = {}) {
  const start = Date.now();
  const result = {
    name: gate.name,
    command: gate.command,
    description: gate.description,
    passed: false,
    duration_ms: 0,
    output: '',
    error: '',
  };

  try {
    const output = execSync(gate.command, {
      cwd: resolve(__dirname, '../..'),
      timeout: 300_000,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    result.passed = true;
    result.output = output.trim().slice(-2000);
  } catch (err) {
    result.passed = false;
    result.error = (err.stderr || err.message || '').trim().slice(-3000);
    result.output = (err.stdout || '').trim().slice(-2000);
  } finally {
    result.duration_ms = Date.now() - start;
  }
  return result;
}

/**
 * Run all gates in order. Stops at first failure.
 * @param {object} options
 * @param {string} options.grade - 'dev' or 'release' (sets EA_NITI_OCR_STRICT)
 * @param {boolean} options.verbose - print gate names as they run
 * @returns {{ passed: boolean, grade: string, gates: object[], summary: string }}
 */
export function runAllGates({ grade = 'dev', verbose = true } = {}) {
  const env = {};
  if (grade === 'release') {
    env.EA_NITI_OCR_STRICT = '1';
  }

  const results = [];
  let allPassed = true;

  if (verbose) {
    console.log(`\n  GATE RUNNER — grade: ${grade}`);
    console.log('  ' + '─'.repeat(50));
  }

  for (const gate of GATE_CONFIG.gates) {
    if (verbose) process.stdout.write(`  ${gate.name.padEnd(18)} `);

    const result = runGate(gate, env);
    results.push(result);

    if (result.passed) {
      if (verbose) console.log(`PASS ${result.duration_ms}ms`);
    } else {
      allPassed = false;
      if (verbose) console.log(`FAIL ${result.duration_ms}ms`);
      if (verbose && result.error) {
        const errLines = result.error.split('\n').slice(0, 8);
        for (const line of errLines) {
          console.log(`    ${line}`);
        }
      }
      break; // stop at first failure
    }
  }

  const passedGates = results.filter(r => r.passed).length;
  const summary = allPassed
    ? `ALL ${results.length} GATES PASSED`
    : `FAILED at gate ${results[results.length - 1]?.name} (${passedGates}/${results.length} passed)`;

  if (verbose) {
    console.log('  ' + '─'.repeat(50));
    console.log(`  ${summary}`);
    console.log();
  }

  return { passed: allPassed, grade, gates: results, summary };
}

/**
 * Run a single test file.
 */
export function runSingleTest(testPath) {
  const cmd = `npx vitest run ${testPath}`;
  return runGate({
    name: 'single-test',
    command: cmd,
    description: `Run single test: ${testPath}`,
  });
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('gate-runner.mjs')) {
  const grade = process.argv.includes('--release') ? 'release' : 'dev';
  const result = runAllGates({ grade });
  process.exit(result.passed ? 0 : 1);
}
