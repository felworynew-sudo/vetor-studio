@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
if not defined NODE_EXE if exist "D:\node.exe" set "NODE_EXE=D:\node.exe"

if not defined NODE_EXE (
  echo.
  echo Node.js was not found.
  echo Install Node.js or make sure node.exe is available.
  pause
  exit /b 1
)

for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
set "NPM_CLI=%NODE_DIR%node_modules\npm\bin\npm-cli.js"

if not exist "%NPM_CLI%" (
  echo.
  echo npm CLI was not found near Node.js:
  echo %NPM_CLI%
  pause
  exit /b 1
)

echo Building portfolio...
"%NODE_EXE%" "%NPM_CLI%" run build
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Opening preview server...
start "" http://localhost:4173
"%NODE_EXE%" "%NPM_CLI%" run preview -- --host 127.0.0.1 --port 4173

pause
