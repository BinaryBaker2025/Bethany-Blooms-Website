@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Please right-click this file and choose "Run as administrator".
  pause
  exit /b 1
)

netsh advfirewall firewall add rule name="Bethany Blooms POS Printer Bridge 8787" dir=in action=allow protocol=TCP localport=8787
netsh advfirewall firewall add rule name="Bethany Blooms POS Printer Bridge 8788" dir=in action=allow protocol=TCP localport=8788
echo Firewall rules added for TCP ports 8787 and 8788.
pause
