@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0BETA2_START.ps1"
if errorlevel 1 (
  echo.
  echo Roadmap Beta 2 did not start. Review the error above.
  pause
)
