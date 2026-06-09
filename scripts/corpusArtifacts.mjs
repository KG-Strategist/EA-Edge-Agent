import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const root = process.cwd();
const lockPath = path.join(root, 'public', 'corpus.lock.json');
const defaultZipPath = path.join(root, 'corpus-artifacts', 'ea-niti-corpus.zip');

function readLock() {
  if (!fs.existsSync(lockPath)) {
    throw new Error('Missing public/corpus.lock.json.');
  }
  return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function isLfsPointer(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(256);
  try {
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1');
  } finally {
    fs.closeSync(fd);
  }
}

function verifyAsset(asset) {
  const filePath = path.join(root, asset.path);
  if (!fs.existsSync(filePath)) {
    return { ok: false, reason: 'missing', asset };
  }
  if (isLfsPointer(filePath)) {
    return { ok: false, reason: 'git-lfs pointer file; run `git lfs install && git lfs pull`', asset };
  }
  const stats = fs.statSync(filePath);
  if (stats.size !== asset.byteLength) {
    return { ok: false, reason: `size ${stats.size} != ${asset.byteLength}`, asset };
  }
  const actualHash = hashFile(filePath);
  if (actualHash !== asset.sha256) {
    return { ok: false, reason: `sha256 ${actualHash} != ${asset.sha256}`, asset };
  }
  return { ok: true, asset };
}

function verify() {
  const lock = readLock();
  const failures = lock.assets.map(verifyAsset).filter(result => !result.ok);
  if (failures.length === 0) {
    console.log(`Corpus artifacts verified: ${lock.corpusVersion} (${lock.recordCount} records).`);
    return;
  }

  console.error('Corpus artifacts are missing or invalid:');
  for (const failure of failures) {
    console.error(`- ${failure.asset.path}: ${failure.reason}`);
  }
  console.error('\nResolve with one of:');
  console.error('- git lfs install && git lfs pull  # when cloning the repository with LFS assets');
  console.error('- npm run fetch:corpus   # when online and EA_NITI_CORPUS_BASE_URL is set');
  console.error('- npm run unpack:corpus  # when corpus-artifacts/ea-niti-corpus.zip is available');
  console.error('- use the full offline release bundle that already contains public corpus files');
  process.exit(1);
}

async function fetchCorpus() {
  const lock = readLock();
  const baseUrl = process.env.EA_NITI_CORPUS_BASE_URL || lock.release?.baseUrl || '';
  if (!baseUrl) {
    console.error('No corpus release base URL configured.');
    console.error('Set EA_NITI_CORPUS_BASE_URL, for example:');
    console.error('EA_NITI_CORPUS_BASE_URL=https://github.com/<owner>/<repo>/releases/download/v1.1.4-corpus npm run fetch:corpus');
    process.exit(1);
  }

  for (const asset of lock.assets) {
    const targetPath = path.join(root, asset.path);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const url = `${baseUrl.replace(/\/$/, '')}/${asset.fileName}`;
    const tmpPath = `${targetPath}.download`;
    console.log(`Downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download ${asset.fileName}: HTTP ${response.status}`);
    }
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmpPath));
    fs.renameSync(tmpPath, targetPath);
  }

  verify();
}

function unpackCorpus(zipPath = defaultZipPath) {
  if (!fs.existsSync(zipPath)) {
    console.error(`Offline corpus zip not found: ${path.relative(root, zipPath)}`);
    console.error('Place the release zip at corpus-artifacts/ea-niti-corpus.zip or pass a path:');
    console.error('node scripts/corpusArtifacts.mjs unpack /path/to/ea-niti-corpus.zip');
    process.exit(1);
  }

  const result = spawnSync('unzip', ['-o', zipPath, '-d', root], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('Failed to unpack corpus zip. Ensure the unzip command is available.');
    process.exit(result.status || 1);
  }
  verify();
}

function packCorpus() {
  const lock = readLock();
  fs.mkdirSync(path.dirname(defaultZipPath), { recursive: true });
  const files = lock.assets.map(asset => asset.path);
  const result = spawnSync('zip', ['-r', defaultZipPath, ...files], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('Failed to create corpus zip. Ensure the zip command is available.');
    process.exit(result.status || 1);
  }
  console.log(`Corpus zip created: ${path.relative(root, defaultZipPath)}`);
}

const command = process.argv[2] || 'verify';
try {
  if (command === 'verify') verify();
  else if (command === 'fetch') await fetchCorpus();
  else if (command === 'unpack') unpackCorpus(process.argv[3] ? path.resolve(process.argv[3]) : defaultZipPath);
  else if (command === 'pack') packCorpus();
  else throw new Error(`Unknown command: ${command}`);
} catch (err) {
  console.error((err instanceof Error ? err.message : String(err)));
  process.exit(1);
}
