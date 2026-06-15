import argparse
import json
import os
import socket
from datetime import datetime
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

try:
    import win32print
except ImportError as exc:
    win32print = None
    WIN32PRINT_IMPORT_ERROR = exc
else:
    WIN32PRINT_IMPORT_ERROR = None

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None
    ImageOps = None


ESC = b"\x1b"
GS = b"\x1d"
LF = b"\x0a"
RECEIPT_WIDTH = 48
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787
DEFAULT_NETWORK_PRINTER_PORT = 9100
DEFAULT_BOTTOM_FEED_LINES = 10
DEFAULT_LOGO_PATH = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "frontend",
        "src",
        "assets",
        "BethanyBloomsLogo.png",
    )
)


def as_text(value):
    if value is None:
        return ""
    return str(value)


def encode_text(value):
    return as_text(value).encode("cp437", errors="replace")


def money(value):
    try:
        amount = Decimal(str(value or 0))
    except (InvalidOperation, ValueError):
        amount = Decimal("0")
    return f"R {amount:,.2f}"


def parse_date(value):
    if not value:
        return datetime.now().strftime("%Y-%m-%d %H:%M")
    text = as_text(value).strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        return datetime.fromisoformat(text).strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return as_text(value)


def resolve_logo_path(requested_path=""):
    candidates = [
        as_text(requested_path).strip(),
        os.environ.get("POS_LOGO_PATH", "").strip(),
        DEFAULT_LOGO_PATH,
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return ""


def resolve_bottom_feed_lines(requested_value=None):
    raw_value = (
        requested_value
        if requested_value is not None
        else os.environ.get("POS_BOTTOM_FEED_LINES", DEFAULT_BOTTOM_FEED_LINES)
    )
    try:
        return max(0, min(20, int(raw_value)))
    except (TypeError, ValueError):
        return DEFAULT_BOTTOM_FEED_LINES


def logo_to_escpos(path, max_width=256):
    if Image is None or not path:
        return b""

    try:
        image = Image.open(path).convert("RGBA")
    except Exception:
        return b""

    background = Image.new("RGBA", image.size, "WHITE")
    background.alpha_composite(image)
    image = background.convert("L")
    image = ImageOps.autocontrast(image)

    if image.width > max_width:
        ratio = max_width / image.width
        image = image.resize((max_width, max(1, int(image.height * ratio))))

    image = image.point(lambda pixel: 0 if pixel < 190 else 255, "1")
    width_bytes = (image.width + 7) // 8
    height = image.height
    raster = bytearray()

    for y in range(height):
        for x_byte in range(width_bytes):
            byte = 0
            for bit in range(8):
                x = x_byte * 8 + bit
                if x < image.width and image.getpixel((x, y)) == 0:
                    byte |= 0x80 >> bit
            raster.append(byte)

    x_l = width_bytes & 0xFF
    x_h = (width_bytes >> 8) & 0xFF
    y_l = height & 0xFF
    y_h = (height >> 8) & 0xFF
    return GS + b"v0" + b"\x00" + bytes([x_l, x_h, y_l, y_h]) + bytes(raster)


class EscPosReceipt:
    def __init__(self, width=RECEIPT_WIDTH):
        self.width = width
        self.parts = [ESC + b"@", ESC + b"t\x00"]

    def raw(self, data):
        self.parts.append(data)

    def align(self, value):
        alignments = {"left": 0, "center": 1, "right": 2}
        self.raw(ESC + b"a" + bytes([alignments.get(value, 0)]))

    def bold(self, enabled):
        self.raw(ESC + b"E" + (b"\x01" if enabled else b"\x00"))

    def size(self, value):
        self.raw(GS + b"!" + bytes([value]))

    def text(self, value=""):
        self.raw(encode_text(value) + LF)

    def blank(self, count=1):
        for _ in range(count):
            self.raw(LF)

    def divider(self, char="-"):
        self.text(char * self.width)

    def center(self, value):
        self.align("center")
        self.text(value)
        self.align("left")

    def row(self, left, right):
        left_text = as_text(left)
        right_text = as_text(right)
        max_left = max(1, self.width - len(right_text) - 1)
        if len(left_text) > max_left:
            left_text = f"{left_text[: max_left - 1]}."
        gap = max(1, self.width - len(left_text) - len(right_text))
        self.text(f"{left_text}{' ' * gap}{right_text}")

    def feed(self, lines=3):
        self.raw(ESC + b"d" + bytes([max(0, min(lines, 9))]))

    def logo(self, path):
        data = logo_to_escpos(path)
        if not data:
            return False
        self.raw(data)
        return True

    def output(self, bottom_feed_lines=None):
        self.align("left")
        self.bold(False)
        self.size(0)
        self.feed(resolve_bottom_feed_lines(bottom_feed_lines))
        return b"".join(self.parts)


def add_brand_header(receipt, subtitle):
    receipt.align("center")
    if receipt.logo(resolve_logo_path()):
        receipt.blank()
    else:
        receipt.bold(True)
        receipt.size(0x11)
        receipt.text("BETHANY BLOOMS")
        receipt.size(0)
        receipt.bold(False)
    receipt.text("bethanyblooms.co.za")
    receipt.text(subtitle)
    receipt.align("left")


def item_label(item):
    product = item.get("product") or {}
    return (
        item.get("name")
        or item.get("productName")
        or product.get("name")
        or product.get("title")
        or "Item"
    )


def item_quantity(item):
    try:
        return int(item.get("quantity") or item.get("qty") or 1)
    except (TypeError, ValueError):
        return 1


def item_price(item):
    product = item.get("product") or {}
    for key in ("unitPrice", "price", "salePrice"):
        if item.get(key) is not None:
            return item.get(key)
    return product.get("price") or 0


def build_receipt_bytes(receipt_data):
    receipt_data = receipt_data or {}
    customer = receipt_data.get("customer") or {}
    items = receipt_data.get("items") or receipt_data.get("cartItems") or []
    totals = receipt_data.get("totals") or {}

    receipt = EscPosReceipt()
    add_brand_header(receipt, "Sales Receipt")
    receipt.divider()

    if receipt_data.get("receiptNumber"):
        receipt.row("Receipt", receipt_data.get("receiptNumber"))
    receipt.row("Date", parse_date(receipt_data.get("createdAt") or receipt_data.get("date")))
    customer_name = receipt_data.get("customerName") or customer.get("name")
    if customer_name:
        receipt.row("Customer", customer_name)
    if receipt_data.get("paymentMethod"):
        receipt.row("Payment", receipt_data.get("paymentMethod"))

    receipt.divider()
    for item in items:
        qty = item_quantity(item)
        unit_price = Decimal(str(item_price(item) or 0))
        total = item.get("total")
        if total is None:
            total = unit_price * qty
        receipt.text(item_label(item))
        receipt.row(f"{qty} x {money(unit_price)}", money(total))

    receipt.divider()
    subtotal = totals.get("subtotal", receipt_data.get("subtotal", 0))
    discount = totals.get("discount", receipt_data.get("discount", 0))
    tax = totals.get("tax", receipt_data.get("tax", 0))
    total = totals.get("total", receipt_data.get("total", subtotal))

    receipt.row("Subtotal", money(subtotal))
    if Decimal(str(discount or 0)) != 0:
        receipt.row("Discount", f"-{money(discount)}")
    if Decimal(str(tax or 0)) != 0:
        receipt.row("Tax", money(tax))
    receipt.bold(True)
    receipt.row("TOTAL", money(total))
    receipt.bold(False)
    if receipt_data.get("cashReceived") is not None:
        receipt.row("Cash", money(receipt_data.get("cashReceived")))
    if receipt_data.get("changeDue") is not None:
        receipt.row("Change", money(receipt_data.get("changeDue")))

    if receipt_data.get("notes"):
        receipt.divider()
        receipt.text(f"Notes: {receipt_data.get('notes')}")

    receipt.divider()
    receipt.center("Thank you for your support")
    receipt.center("Bethany Blooms")
    receipt.blank(2)
    return receipt.output()


def build_bill_bytes(payload):
    payload = payload or {}
    items = payload.get("cartItems") or payload.get("items") or []
    subtotal = payload.get("subtotal", 0)
    table_label = payload.get("tableLabel") or "Sale"

    receipt = EscPosReceipt()
    add_brand_header(receipt, "Bill / Order")
    receipt.divider()
    receipt.row("Table / Sale", table_label)
    receipt.row("Date", datetime.now().strftime("%Y-%m-%d %H:%M"))
    receipt.divider()

    for item in items:
        qty = item_quantity(item)
        unit_price = Decimal(str(item_price(item) or 0))
        receipt.text(item_label(item))
        receipt.row(f"{qty} x {money(unit_price)}", money(unit_price * qty))

    receipt.divider()
    receipt.bold(True)
    receipt.row("TOTAL", money(subtotal))
    receipt.bold(False)
    receipt.center("Printed receipt of order")
    receipt.blank(2)
    return receipt.output()


def get_printers():
    if win32print is None:
        return []
    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    return [printer[2] for printer in win32print.EnumPrinters(flags)]


def get_default_printer():
    if win32print is None:
        return ""
    try:
        return win32print.GetDefaultPrinter()
    except Exception:
        return ""


def resolve_printer_name(requested_name):
    return (
        as_text(requested_name).strip()
        or os.environ.get("POS_PRINTER_NAME", "").strip()
        or get_default_printer()
    )


def resolve_network_printer_host(requested_host=""):
    return as_text(requested_host).strip() or os.environ.get("POS_PRINTER_HOST", "").strip()


def resolve_network_printer_port(requested_port=None):
    raw_value = (
        requested_port
        if requested_port is not None
        else os.environ.get("POS_PRINTER_PORT", DEFAULT_NETWORK_PRINTER_PORT)
    )
    try:
        port = int(raw_value)
    except (TypeError, ValueError):
        port = DEFAULT_NETWORK_PRINTER_PORT
    return max(1, min(65535, port))


def send_raw_to_windows_printer(printer_name, data):
    if win32print is None:
        raise RuntimeError(
            "pywin32 is not installed. Run: py -m pip install -r requirements.txt"
        ) from WIN32PRINT_IMPORT_ERROR

    if not printer_name:
        raise RuntimeError("No printer selected and Windows has no default printer.")

    handle = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(handle, 1, ("Bethany Blooms POS Receipt", None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, data)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)


def send_raw_to_network_printer(host, port, data):
    if not host:
        raise RuntimeError("No network printer host was provided.")
    try:
        with socket.create_connection((host, port), timeout=8) as connection:
            connection.sendall(data)
    except OSError as exc:
        raise RuntimeError(
            f"Could not connect to network printer at {host}:{port}. "
            "Check the printer IP address, WiFi connection, and that raw port 9100 is enabled."
        ) from exc


def send_raw_to_printer(payload, data):
    network_host = resolve_network_printer_host(payload.get("printerHost"))
    if network_host:
        network_port = resolve_network_printer_port(payload.get("printerPort"))
        send_raw_to_network_printer(network_host, network_port, data)
        return {"mode": "network", "printerHost": network_host, "printerPort": network_port}

    printer_name = resolve_printer_name(payload.get("printerName"))
    send_raw_to_windows_printer(printer_name, data)
    return {"mode": "windows", "printerName": printer_name}


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "BethanyBloomsPosPrinterBridge/1.0"

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        body = self.rfile.read(length)
        return json.loads(body.decode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self.send_json(
                200,
                {
                    "ok": True,
                    "defaultPrinter": get_default_printer(),
                    "selectedPrinter": resolve_printer_name(""),
                    "networkPrinterHost": resolve_network_printer_host(),
                    "networkPrinterPort": resolve_network_printer_port(),
                    "logoPath": resolve_logo_path(),
                    "logoEnabled": bool(resolve_logo_path()) and Image is not None,
                    "bottomFeedLines": resolve_bottom_feed_lines(),
                },
            )
            return
        if path == "/printers":
            self.send_json(
                200,
                {
                    "ok": True,
                    "defaultPrinter": get_default_printer(),
                    "printers": get_printers(),
                },
            )
            return
        self.send_json(404, {"ok": False, "error": "Unknown endpoint."})

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            payload = self.read_json()

            if path == "/print-receipt":
                receipt_data = payload.get("receiptData") or payload
                data = build_receipt_bytes(receipt_data)
            elif path == "/print-bill":
                data = build_bill_bytes(payload)
            elif path == "/test-print":
                data = build_bill_bytes(
                    {
                        "tableLabel": "Network printer test",
                        "subtotal": 0,
                        "items": [{"name": "Bethany Blooms printer test", "quantity": 1, "price": 0}],
                    }
                )
            else:
                self.send_json(404, {"ok": False, "error": "Unknown endpoint."})
                return

            result = send_raw_to_printer(payload, data)
            self.send_json(200, {"ok": True, **result})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})


def main():
    parser = argparse.ArgumentParser(description="Bethany Blooms POS printer bridge")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--printer", default="")
    parser.add_argument(
        "--printer-host",
        default="",
        help="Network printer IP/host. When set, raw ESC/POS is sent to this host instead of Windows USB printing.",
    )
    parser.add_argument(
        "--printer-port",
        type=int,
        default=None,
        help="Network printer raw TCP port. Most ESC/POS network printers use 9100.",
    )
    parser.add_argument("--logo", default="")
    parser.add_argument(
        "--bottom-feed",
        type=int,
        default=None,
        help="Blank feed lines after printing so the receipt can be torn off cleanly.",
    )
    args = parser.parse_args()

    if args.printer:
        os.environ["POS_PRINTER_NAME"] = args.printer
    if args.printer_host:
        os.environ["POS_PRINTER_HOST"] = args.printer_host
    if args.printer_port is not None:
        os.environ["POS_PRINTER_PORT"] = str(args.printer_port)
    if args.logo:
        os.environ["POS_LOGO_PATH"] = args.logo
    if args.bottom_feed is not None:
        os.environ["POS_BOTTOM_FEED_LINES"] = str(args.bottom_feed)

    server = ThreadingHTTPServer((args.host, args.port), BridgeHandler)
    print("Bethany Blooms POS printer bridge")
    print(f"Listening on http://{args.host}:{args.port}")
    print(f"Default printer: {get_default_printer() or '(none)'}")
    print(f"Selected printer: {resolve_printer_name('') or '(none)'}")
    if resolve_network_printer_host():
        print(
            "Network printer: "
            f"{resolve_network_printer_host()}:{resolve_network_printer_port()}"
        )
    print(f"Logo path: {resolve_logo_path() or '(text fallback)'}")
    print(f"Logo printing: {'enabled' if Image is not None and resolve_logo_path() else 'text fallback'}")
    print(f"Bottom feed lines: {resolve_bottom_feed_lines()}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
