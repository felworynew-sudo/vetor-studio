@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
if not defined NODE_EXE if exist "D:\node.exe" set "NODE_EXE=D:\node.exe"

if not defined NODE_EXE (
  echo.
  echo Node.js was not found.
  pause
  exit /b 1
)

for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
set "NPM_CLI=%NODE_DIR%node_modules\npm\bin\npm-cli.js"
set "NPX_CLI=%NODE_DIR%node_modules\npm\bin\npx-cli.js"

if not exist "%NPM_CLI%" (
  echo.
  echo npm CLI was not found near Node.js:
  echo %NPM_CLI%
  pause
  exit /b 1
)

if not exist "%NPX_CLI%" (
  echo.
  echo npx CLI was not found near Node.js:
  echo %NPX_CLI%
  pause
  exit /b 1
)

echo Installing dependencies if needed...
"%NODE_EXE%" "%NPM_CLI%" install
if errorlevel 1 goto fail

echo.
echo Building portfolio...
"%NODE_EXE%" "%NPM_CLI%" run build
if errorlevel 1 goto fail

echo.
echo Deploying to Cloudflare Pages project: portfolovetor
set /a DEPLOY_TRY=0
set /a DEPLOY_MAX=6
set /a DEPLOY_WAIT=6

:deploy_try
set /a DEPLOY_TRY+=1
echo Attempt %DEPLOY_TRY% of %DEPLOY_MAX%...
"%NODE_EXE%" "%NPX_CLI%" wrangler pages deploy dist --project-name portfolovetor --branch main --commit-dirty=true
if not errorlevel 1 goto deploy_ok
if %DEPLOY_TRY% GEQ %DEPLOY_MAX% goto deploy_fallback
echo Deploy attempt failed, retrying in %DEPLOY_WAIT% seconds...
timeout /t %DEPLOY_WAIT% /nobreak >nul
set /a DEPLOY_WAIT+=4
goto deploy_try

:deploy_fallback
echo.
echo Trying fallback mode with --skip-caching...
set /a FALLBACK_TRY=0
set /a FALLBACK_MAX=3

:fallback_try
set /a FALLBACK_TRY+=1
echo Fallback attempt %FALLBACK_TRY% of %FALLBACK_MAX%...
"%NODE_EXE%" "%NPX_CLI%" wrangler pages deploy dist --project-name portfolovetor --branch main --commit-dirty=true --skip-caching
if not errorlevel 1 goto deploy_ok
if %FALLBACK_TRY% GEQ %FALLBACK_MAX% goto fail
echo Fallback attempt failed, retrying in 10 seconds...
timeout /t 10 /nobreak >nul
goto fallback_try

:deploy_ok

echo.
echo Done. Open: https://portfolovetor.pages.dev/
pause
exit /b 0

:fail
echo.
echo Deploy failed. If Wrangler asks for CLOUDFLARE_API_TOKEN, set it first or run wrangler login in a normal terminal.
pause
exit /b 1
