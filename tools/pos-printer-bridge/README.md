# Bethany Blooms POS Printer Bridge

The browser print dialog is the wrong path for this thermal printer. It can send label-driver command text to the printer, which is why receipts print as very long pages with `SIZE`, `BITMAP`, and random characters.

Run this bridge on the laptop that is connected to the POS printer. The website sends receipt data to the bridge, and the bridge sends raw ESC/POS bytes directly to Windows printing.

The website can be hosted online, but the physical printer still needs this bridge running on a powered-on Windows device at the shop. If this development PC is off, printing still works as long as the bridge is running on the actual till laptop, shop PC, or an always-on mini PC connected to the printer.

## Quick Start

```powershell
cd tools\pos-printer-bridge
.\start-pos-printer-bridge.bat
```

Set the POS printer as the Windows default printer, then print from the POS page.

## Use a Specific Printer

If Windows default is not the POS printer, run:

```powershell
cd tools\pos-printer-bridge
py -m pip install -r requirements.txt
py pos_printer_bridge.py --printer "Exact Windows Printer Name"
```

To see the exact printer names, open:

```text
http://127.0.0.1:8787/printers
```

## WiFi / Network Printer

If the thermal printer is connected to WiFi or Ethernet and supports raw ESC/POS printing, you can print directly to its IP address. Most receipt printers use port `9100`.

```powershell
cd tools\pos-printer-bridge
py -m pip install -r requirements.txt
py pos_printer_bridge.py --printer-host 192.168.1.50 --printer-port 9100
```

Replace `192.168.1.50` with the printer's actual IP address. Check the printer network settings page, router DHCP list, or print a printer self-test page to find the IP.

To send a small test print:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8787/test-print -ContentType "application/json" -Body "{}"
```

If that works, leave the bridge running and print from the POS normally. The POS website still sends receipt data to the bridge; the bridge then sends it over WiFi to the printer.

Important: normal WiFi receipt printers are still local network devices. They usually do not receive print jobs directly from the public web/cloud unless the printer specifically supports cloud printing or CloudPRNT-style polling.

For the Bethany Blooms tablet setup with the Xprinter on `192.168.1.250`, use:

```powershell
.\start-tablet-ethernet-bridge.bat
```

This starts the bridge on port `8788`, so the tablet bridge URL should be:

```text
http://LAPTOP-IP:8788
```

If the tablet cannot open `http://LAPTOP-IP:8788/health`, right-click `allow-firewall-tablet-bridge-admin.bat` and choose **Run as administrator**.

The live POS page has a collapsed **Printer settings** panel near **Print Bill**. Set the bridge URL to the laptop address, for example:

```text
http://192.168.1.100:8788
```

Then click **Save for all POS devices**. After that, every tablet/admin browser loads the saved bridge URL from Firebase.

## Start Automatically on the Laptop

Run this once on the till laptop:

```powershell
.\install-tablet-bridge-startup.bat
```

This installs a Windows login task that starts the Ethernet bridge on port `8788` automatically.

Tomorrow morning, printing will work again if:

- the printer is connected to the router and still uses `192.168.1.250`
- the laptop is powered on and logged in
- the laptop keeps the same IP used by the tablet bridge URL, for example `192.168.1.100`
- Windows Firewall allows inbound TCP `8788`

For a shop setup, reserve the printer IP and laptop IP in the router DHCP settings so they do not change.

## Dedicated Laptop Setup

Use a dedicated laptop as the always-on bridge machine.

Recommended fixed addresses:

```text
Printer: 192.168.1.250
Laptop:  192.168.1.100
Bridge:  http://192.168.1.100:8788
```

Best option: reserve the laptop IP in the router.

1. Connect the laptop to the same WiFi/router as the printer.
2. On the laptop, open PowerShell and run `ipconfig /all`.
3. Copy the WiFi adapter **Physical Address**. That is the laptop MAC address.
4. Log into the router.
5. Open DHCP / LAN / Address Reservation.
6. Reserve the laptop MAC address as `192.168.1.100`.
7. Reserve the printer MAC address as `192.168.1.250`.
8. Restart the router, printer, and laptop.
9. Confirm on the laptop:

```powershell
ipconfig
Test-NetConnection 192.168.1.250 -Port 9100
```

10. Start or install the bridge:

```powershell
.\start-tablet-ethernet-bridge.bat
.\install-tablet-bridge-startup.bat
```

11. On the tablet, test:

```text
http://192.168.1.100:8788/health
```

If the laptop IP changes, update the live POS **Printer settings** bridge URL and click **Save for all POS devices**.

## Why the Bridge Cannot Run on Firebase

Firebase can host the website and store the saved printer settings, but it cannot directly print to `192.168.1.250` because that address only exists inside the shop network. A cloud server cannot connect back into that private LAN printer.

To print while the laptop is off, you need one of these instead:

- an always-on device in the shop running this bridge, such as the till laptop, a mini PC, or a small Raspberry Pi-style device
- an Android printing app/bridge running on the tablet
- a printer that supports its own cloud printing or CloudPRNT-style polling

## Tablet Printing

For a tablet to print through the laptop, run the bridge on the laptop like this:

```powershell
py pos_printer_bridge.py --host 0.0.0.0 --printer "Exact Windows Printer Name"
```

Then set the POS page's printer bridge URL to:

```text
http://LAPTOP-IP-ADDRESS:8787
```

Windows Firewall may ask for permission the first time. Allow it on the private network.

## Logo Printing

The bridge tries to print `frontend\src\assets\BethanyBloomsLogo.png` at the top of the receipt. If the image cannot be loaded or the printer does not support raster image commands, the receipt falls back to the large text heading `BETHANY BLOOMS`.

To use a different logo file:

```powershell
py pos_printer_bridge.py --logo "C:\Path\To\logo.png" --printer "Exact Windows Printer Name"
```

## Tear-Off Space

Use `--bottom-feed` to control how much blank paper feeds after the receipt. Higher numbers give more space below the printed text.

```powershell
py pos_printer_bridge.py --bottom-feed 12 --printer "Exact Windows Printer Name"
```

Start with `12`. If it still tears too close to the text, try `14` or `16`. The bridge accepts values from `0` to `20`.
