#!/usr/bin/env node
/**
 * daemon-e2e.mjs — proves LocalDaemonProvider ↔ eaniti-daemon handshake end-to-end.
 *
 * Usage: start the daemon first, then run this script.
 *   daemon/target/release/eaniti-daemon &
 *   node scripts/daemon-e2e.mjs
 */
import { WebSocket } from 'ws';

const URL = process.env.DAEMON_URL || 'ws://127.0.0.1:8080';
const results = { connected: false, generate: false, abort: false, reset: false };

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const t = setTimeout(() => reject(new Error('connect timeout')), 3000);
    ws.on('open', () => { clearTimeout(t); resolve(ws); });
    ws.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

function waitMsg(ws, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('msg timeout')), timeoutMs);
    ws.once('message', (data) => { clearTimeout(t); resolve(JSON.parse(data)); });
  });
}

async function testGenerate(ws) {
  send(ws, { id: 'g1', type: 'GENERATE', messages: [{ role: 'user', content: 'E2E probe' }], max_tokens: 3 });
  let chunks = 0;
  let full = '';
  for (let i = 0; i < 10; i++) {
    const msg = await waitMsg(ws, 3000);
    if (msg.type === 'INFERENCE_CHUNK') { chunks++; full += msg.token; }
    if (msg.type === 'INFERENCE_COMPLETE') {
      results.generate = chunks > 0 && full.length > 0;
      console.log(`  GENERATE: ${chunks} chunks, full=${JSON.stringify(full)}`);
      return;
    }
  }
  throw new Error('no INFERENCE_COMPLETE');
}

async function testAbort(ws) {
  send(ws, { id: 'a1', type: 'GENERATE', messages: [{ role: 'user', content: 'Long prompt for abort test' }], max_tokens: 100 });
  await new Promise(r => setTimeout(r, 80));
  send(ws, { type: 'ABORT', id: 'a1' });
  const msg = await waitMsg(ws, 2000);
  results.abort = msg.type === 'ABORTED' || msg.type === 'ERROR';
  console.log(`  ABORT: got ${msg.type}`);
}

async function testReset(ws) {
  send(ws, { id: 'r1', type: 'GENERATE', messages: [{ role: 'user', content: 'pre-reset' }], max_tokens: 2 });
  // drain until complete
  for (let i = 0; i < 10; i++) {
    const m = await waitMsg(ws, 3000);
    if (m.type === 'INFERENCE_COMPLETE') break;
  }
  send(ws, { type: 'RESET_SESSION' });
  await new Promise(r => setTimeout(r, 100));
  send(ws, { id: 'r2', type: 'GENERATE', messages: [{ role: 'user', content: 'post-reset' }], max_tokens: 2 });
  // drain until complete
  for (let i = 0; i < 10; i++) {
    const m = await waitMsg(ws, 3000);
    if (m.type === 'INFERENCE_COMPLETE') {
      results.reset = true;
      console.log('  RESET: post-reset generation completed');
      return;
    }
  }
  throw new Error('RESET: no INFERENCE_COMPLETE for r2');
}

async function main() {
  console.log(`Connecting to ${URL}...`);
  const ws = await connect();
  results.connected = true;
  console.log('  CONNECTED');

  await testGenerate(ws);
  await testAbort(ws);
  await testReset(ws);

  ws.close();
  const passed = Object.values(results).every(Boolean);
  console.log(`\nResults: ${JSON.stringify(results)}`);
  console.log(passed ? 'ALL PASSED' : 'SOME FAILED');
  process.exit(passed ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
