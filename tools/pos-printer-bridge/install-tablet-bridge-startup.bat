@echo off
setlocal

set "TASK_NAME=Bethany Blooms POS Printer Bridge"
set "SCRIPT_PATH=%~dp0start-tablet-ethernet-bridge.ps1"
set "TASK_COMMAND=powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%SCRIPT_PATH%"""

schtasks /Create /TN "%TASK_NAME%" /SC ONLOGON /TR "%TASK_COMMAND%" /F
if %errorlevel% neq 0 (
  echo Could not install the startup task.
  pause
  exit /b 1
)

echo Installed the POS printer bridge startup task.
echo It will start automatically when this Windows user logs in.
pause
