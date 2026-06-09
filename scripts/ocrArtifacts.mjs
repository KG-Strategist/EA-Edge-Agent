import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const root = process.cwd();
const lockPath = path.join(root, 'public', 'ocr', 'ocr.lock.json');
const defaultZipPath = path.join(root, 'corpus-artifacts', 'ea-niti-ocr.zip');

const PLACEHOLDER_SHA_MARKER = 'REPLACE_WITH_REAL_SHA256_';
const STRICT_VERIFY = process.env.EA_NITI_OCR_STRICT === '1';

function readLock() {
  if (!fs.existsSync(lockPath)) {
    throw new Error('Missing public/ocr/ocr.lock.json. Place the OCR lock manifest before running verify.');
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
  const isPlaceholderSha = typeof asset.sha256 === 'string' && asset.sha256.startsWith(PLACEHOLDER_SHA_MARKER);

  if (STRICT_VERIFY && isPlaceholderSha) {
    return {
      ok: false,
      reason: 'placeholder SHA in lock; run `node scripts/ocrArtifacts.mjs unlock` after publishing real assets.',
      asset,
    };
  }
  if (!fs.existsSync(filePath)) {
    if (isPlaceholderSha) {
      return { ok: true, asset, note: 'placeholder lock; on-disk file not yet published' };
    }
    return { ok: false, reason: 'missing', asset };
  }
  if (isLfsPointer(filePath)) {
    return { ok: false, reason: 'git-lfs pointer file; run `git lfs install && git lfs pull`', asset };
  }
  const stats = fs.statSync(filePath);
  if (!isPlaceholderSha && stats.size !== asset.byteLength) {
    return { ok: false, reason: `size ${stats.size} != ${asset.byteLength}`, asset };
  }
  if (isPlaceholderSha) {
    return { ok: true, asset, note: 'placeholder SHA accepted in dev; do not ship' };
  }
  const actualHash = hashFile(filePath);
  if (actualHash !== asset.sha256) {
    return { ok: false, reason: `sha256 ${actualHash} != ${asset.sha256}`, asset };
  }
  return { ok: true, asset };
}

function verify() {
  const lock = readLock();
  if (lock.assets.length === 0) {
    const placeholder = lock.description && lock.description.toLowerCase().includes('placeholder');
    if (placeholder) {
      console.log(`OCR artifacts verified: ${lock.ocrVersion} (0 asset(s) — placeholder lock; OCR runtime will fall back to geometric OCR).`);
      return;
    }
    console.log(`OCR artifacts verified: ${lock.ocrVersion} (0 asset(s)).`);
    return;
  }
  const results = lock.assets.map(verifyAsset);
  const failures = results.filter((result) => !result.ok);
  if (failures.length === 0) {
    const placeholders = results.filter((r) => r.note).length;
    if (placeholders > 0) {
      console.log(`OCR artifacts verified: ${lock.ocrVersion} (${lock.assets.length} asset(s); ${placeholders} placeholder(s) in dev mode).`);
    } else {
      console.log(`OCR artifacts verified: ${lock.ocrVersion} (${lock.assets.length} asset(s)).`);
    }
    return;
  }
  console.error('OCR artifacts are missing or invalid:');
  for (const failure of failures) {
    console.error(`- ${failure.asset.path}: ${failure.reason}`);
  }
  console.error('\nResolve with one of:');
  console.error('- git lfs install && git lfs pull  # when cloning with LFS assets');
  console.error('- use the offline release bundle that already contains the OCR files');
  console.error('- node scripts/ocrArtifacts.mjs fetch  # when EA_NITI_OCR_BASE_URL is set');
  console.error('- node scripts/ocrArtifacts.mjs unpack /path/to/ea-niti-ocr.zip');
  process.exit(1);
}

function unlockAsset(asset) {
  const filePath = path.join(root, asset.path);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cannot unlock: ${asset.path} is missing on disk.`);
  }
  if (isLfsPointer(filePath)) {
    throw new Error(`Cannot unlock: ${asset.path} is a Git LFS pointer. Run \`git lfs pull\` first.`);
  }
  const stats = fs.statSync(filePath);
  const sha = hashFile(filePath);
  asset.byteLength = stats.size;
  asset.sha256 = sha;
  console.log(`  unlocked: ${asset.path}  (${stats.size.toLocaleString()} bytes, sha256=${sha.slice(0, 12)}…)`);
}

function unlock() {
  const lock = readLock();
  if (lock.assets.length === 0) {
    console.log('No assets in lock manifest; nothing to unlock.');
    return;
  }
  let changed = false;
  for (const asset of lock.assets) {
    if (typeof asset.sha256 === 'string' && asset.sha256.startsWith(PLACEHOLDER_SHA_MARKER)) {
      try {
        unlockAsset(asset);
        changed = true;
      } catch (error) {
        console.warn(`  skipped: ${asset.path}: ${error.message}`);
      }
    }
  }
  if (changed) {
    lock.assets.sort((a, b) => a.path.localeCompare(b.path));
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
    console.log(`Updated ${path.relative(root, lockPath)} with real SHA-256 fingerprints.`);
  } else {
    console.log('No placeholder SHA-256 fingerprints found; nothing to unlock.');
  }
}

function forge() {
  const forgeScript = path.join(root, 'scripts', 'forge_bespoke_model.mjs');
  if (!fs.existsSync(forgeScript)) {
    console.error(`Forge script not found: ${path.relative(root, forgeScript)}`);
    process.exit(1);
  }
  const result = spawnSync('node', [forgeScript], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
  // After forging, unlock the GGUF asset entry in the lockfile.
  unlock();
}

async function fetchOcr() {
  const lock = readLock();
  const baseUrl = process.env.EA_NITI_OCR_BASE_URL || lock.release?.baseUrl || '';
  if (!baseUrl) {
    console.error('No OCR release base URL configured.');
    console.error('Set EA_NITI_OCR_BASE_URL, for example:');
    console.error('EA_NITI_OCR_BASE_URL=https://github.com/<owner>/<repo>/releases/download/v1.1.4-ocr npm run fetch:ocr');
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

function unpackOcr(zipPath = defaultZipPath) {
  if (!fs.existsSync(zipPath)) {
    console.error(`Offline OCR zip not found: ${path.relative(root, zipPath)}`);
    console.error('Place the release zip at corpus-artifacts/ea-niti-ocr.zip or pass a path:');
    console.error('node scripts/ocrArtifacts.mjs unpack /path/to/ea-niti-ocr.zip');
    process.exit(1);
  }
  const result = spawnSync('unzip', ['-o', zipPath, '-d', root], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('Failed to unpack OCR zip. Ensure the unzip command is available.');
    process.exit(result.status || 1);
  }
  verify();
}

function packOcr() {
  const lock = readLock();
  if (lock.assets.length === 0) {
    console.error('No assets in lock manifest. Add real assets before packing.');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(defaultZipPath), { recursive: true });
  const files = lock.assets.map((asset) => asset.path);
  const result = spawnSync('zip', ['-r', defaultZipPath, ...files], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('Failed to create OCR zip. Ensure the zip command is available.');
    process.exit(result.status || 1);
  }
  console.log(`OCR zip created: ${path.relative(root, defaultZipPath)}`);
}

const command = process.argv[2] || 'verify';
try {
  if (command === 'verify') verify();
  else if (command === 'fetch') await fetchOcr();
  else if (command === 'unpack') unpackOcr(process.argv[3] ? path.resolve(process.argv[3]) : defaultZipPath);
  else if (command === 'pack') packOcr();
  else if (command === 'unlock') unlock();
  else if (command === 'forge') forge();
  else throw new Error(`Unknown command: ${command}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
