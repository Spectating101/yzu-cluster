@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_crypto_panel_failover_windows.ps1"
set EXITCODE=%ERRORLEVEL%

if not "%EXITCODE%"=="0" (
  echo Windows failover task installer exited with code %EXITCODE%.
  pause
)

endlocal & exit /b %EXITCODE%
