@echo off
cd /d F:\ea-niti-edge-agent

echo [1] Removing vitest.config.ts from git tracking...
git rm --cached vitest.config.ts
if errorlevel 1 goto error

echo [2] Removing src\__tests__ from git tracking...
git rm -r --cached src\__tests__
if errorlevel 1 goto error

echo [3] Adding .gitignore update...
git add .gitignore
if errorlevel 1 goto error

echo [4] Committing changes...
git commit -m "chore: remove internal test suite from public repo (vitest.config.ts, src/__tests__)"
if errorlevel 1 goto error

echo [5] Verifying changes...
git status --short | findstr "vitest __tests__"
echo.
echo ✓ Task completed successfully!
echo ✓ vitest.config.ts and src/__tests__/ now ignored and removed from public repo
goto end

:error
echo.
echo ✗ Error occurred during git operations
exit /b 1

:end
pause
