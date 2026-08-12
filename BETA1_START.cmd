@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0BETA1_START.ps1"
if errorlevel 1 (
  echo.
  echo Roadmap Beta 1 did not start. Review the error above.
  pause
)
endlocal
