@echo off
setlocal
cd /d "%~dp0"
py -m pip install -r requirements.txt
py pos_printer_bridge.py
