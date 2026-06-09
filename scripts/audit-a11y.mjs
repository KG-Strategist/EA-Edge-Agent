import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const CONTROL_RE = /<(input|select|textarea)\b[\s\S]*?(?:\/>|>)/g;
const SELF_LABELED_RE = /\b(id|name|aria-label|aria-labelledby)=/;
const HIDDEN_RE = /\btype=["']hidden["']|\bclassName=["'][^"']*(?:hidden|sr-only)[^"']*["']/;

async function listTsxFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listTsxFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.tsx') ? [fullPath] : [];
  }));
  return files.flat();
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

const failures = [];
const files = await listTsxFiles(SRC_DIR);

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const scanSource = source.replace(/=>/g, '=');
  for (const match of scanSource.matchAll(CONTROL_RE)) {
    const tag = match[0];
    if (HIDDEN_RE.test(tag)) continue;
    if (SELF_LABELED_RE.test(tag)) continue;
    failures.push({
      file: path.relative(ROOT, file),
      line: lineNumber(source, match.index ?? 0),
      tag: tag.replace(/\s+/g, ' ').slice(0, 140),
    });
  }
}

if (failures.length > 0) {
  console.error(`Accessible form-control audit failed: ${failures.length} unlabeled controls found.`);
  for (const failure of failures) {
    console.error(`${failure.file}:${failure.line} ${failure.tag}`);
  }
  process.exit(1);
}

console.log(`Accessible form-control audit passed across ${files.length} TSX files.`);
