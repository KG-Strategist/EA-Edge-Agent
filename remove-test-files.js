#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

const projectRoot = 'F:\\ea-niti-edge-agent';
process.chdir(projectRoot);

console.log('🔧 Removing test files from git tracking...\n');

try {
  console.log('[1] Removing vitest.config.ts from git tracking...');
  execSync('git rm --cached vitest.config.ts', { stdio: 'inherit' });
  console.log('✓ Done\n');

  console.log('[2] Removing src\\__tests__ from git tracking...');
  execSync('git rm -r --cached src\\__tests__', { stdio: 'inherit' });
  console.log('✓ Done\n');

  console.log('[3] Adding .gitignore update...');
  execSync('git add .gitignore', { stdio: 'inherit' });
  console.log('✓ Done\n');

  console.log('[4] Committing changes...');
  execSync('git commit -m "chore: remove internal test suite from public repo (vitest.config.ts, src/__tests__)"', { stdio: 'inherit' });
  console.log('✓ Done\n');

  console.log('[5] Verifying git status...');
  const status = execSync('git status --short', { encoding: 'utf-8' });
  console.log(status);

  console.log('\n✅ Task completed successfully!');
  console.log('✅ vitest.config.ts and src/__tests__/ are now:');
  console.log('   - Removed from public repo tracking');
  console.log('   - Added to .gitignore');
  console.log('   - Retained locally for internal use\n');

  process.exit(0);
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
}
