#!/usr/bin/env node
// serve-target.mjs — Start the app for testing (prod build or Node 22 dev server)
// Usage: node serve-target.mjs --target=prod|dev --port=3000

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

const TARGET = args.target || 'prod';
const PORT = parseInt(args.port || '3000', 10);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.gguf': 'application/octet-stream',
  '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

async function startProd() {
  const distDir = join(ROOT, 'dist');
  if (!existsSync(distDir)) {
    console.error('dist/ not found — run "npm run build" first');
    process.exit(1);
  }

  const server = createServer(async (req, res) => {
    let url = req.url.split('?')[0];
    if (url === '/') url = '/index.html';

    const filePath = join(distDir, url);
    try {
      const data = await readFile(filePath);
      const ext = extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      });
      res.end(data);
    } catch {
      const indexData = await readFile(join(distDir, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(indexData);
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Production build serving at http://localhost:${PORT}`);
  });
}

async function startDev() {
  const node22 = '/opt/homebrew/Cellar/node@22/22.23.2/bin/node';
  const viteBin = join(ROOT, 'node_modules/.bin/vite');

  const child = spawn(node22, [viteBin, '--port', String(PORT), '--host', '0.0.0.0'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PATH: `/opt/homebrew/Cellar/node@22/22.23.2/bin:${process.env.PATH}` },
  });

  child.on('exit', (code) => process.exit(code ?? 1));
}

if (TARGET === 'prod') startProd();
else startDev();
