@echo off
setlocal
cd /d "%~dp0"
set "GUMMY_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "GUMMY_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Run pnpm install in this folder first.
  pause
  exit /b 1
)
echo Open the Local address printed below in your browser.
echo Add /?q=low to that address for lower graphics settings.
echo If port 5202 is busy, Vite will use the next available port.
echo Keep this window open. Press Ctrl+C to stop the game.
"%GUMMY_NODE%" node_modules\vite\bin\vite.js --host 127.0.0.1 --port 5202
if errorlevel 1 pause
