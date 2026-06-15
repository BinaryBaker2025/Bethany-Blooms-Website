Set-Location $PSScriptRoot

py -m pip install -r requirements.txt
py pos_printer_bridge.py --host 0.0.0.0 --port 8788 --printer-host 192.168.1.250 --printer-port 9100 --bottom-feed 12
