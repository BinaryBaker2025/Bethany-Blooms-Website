const BRIDGE_URL_STORAGE_KEY = "bethanyBloomsPosPrinterBridgeUrl";
const PRINTER_NAME_STORAGE_KEY = "bethanyBloomsPosPrinterName";
const LOCAL_BRIDGE_URL = "http://127.0.0.1:8787";
const TABLET_BRIDGE_URL = "http://192.168.1.100:8788";

const LEGACY_BRIDGE_URLS = new Set([
  "http://127.0.0.1:8787",
  "https://127.0.0.1:8787",
  "https:127.0.0.1:8787",
]);

const isBrowser = () => typeof window !== "undefined";

const getDefaultBridgeUrl = () => {
  if (!isBrowser()) return LOCAL_BRIDGE_URL;
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return LOCAL_BRIDGE_URL;
  }
  return TABLET_BRIDGE_URL;
};

const normalizeBridgeUrl = (value) => {
  const trimmed = (value || "").trim();
  return trimmed.replace(/\/+$/, "") || getDefaultBridgeUrl();
};

export const getPosPrinterBridgeUrl = () => {
  if (!isBrowser()) return LOCAL_BRIDGE_URL;
  const storedUrl = normalizeBridgeUrl(
    window.localStorage.getItem(BRIDGE_URL_STORAGE_KEY),
  );
  const defaultUrl = getDefaultBridgeUrl();
  if (defaultUrl === TABLET_BRIDGE_URL && LEGACY_BRIDGE_URLS.has(storedUrl)) {
    window.localStorage.setItem(BRIDGE_URL_STORAGE_KEY, defaultUrl);
    return defaultUrl;
  }
  return storedUrl;
};

export const setPosPrinterBridgeUrl = (value) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    BRIDGE_URL_STORAGE_KEY,
    normalizeBridgeUrl(value),
  );
};

export const getPosPrinterName = () => {
  if (!isBrowser()) return "";
  return (window.localStorage.getItem(PRINTER_NAME_STORAGE_KEY) || "").trim();
};

export const setPosPrinterName = (value) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(PRINTER_NAME_STORAGE_KEY, (value || "").trim());
};

const readBridgeError = async (response) => {
  try {
    const payload = await response.json();
    return payload?.error || payload?.message || response.statusText;
  } catch {
    return response.statusText;
  }
};

const postToBridge = async (path, payload, bridgeUrl) => {
  const targetUrl = `${normalizeBridgeUrl(bridgeUrl)}${path}`;
  let response;
  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      `Could not reach the POS printer bridge at ${normalizeBridgeUrl(
        bridgeUrl,
      )}. Start tools\\pos-printer-bridge\\start-tablet-ethernet-bridge.bat on the till laptop, then try again.`,
    );
  }

  if (!response.ok) {
    const message = await readBridgeError(response);
    throw new Error(`POS printer bridge failed: ${message}`);
  }

  return response.json();
};

const withPrinterName = (payload, printerName) => {
  const selectedPrinter = (printerName || "").trim();
  return selectedPrinter
    ? { ...payload, printerName: selectedPrinter }
    : payload;
};

export const printReceiptViaBridge = ({
  bridgeUrl = getDefaultBridgeUrl(),
  printerName = "",
  receiptData,
}) =>
  postToBridge(
    "/print-receipt",
    withPrinterName({ receiptData }, printerName),
    bridgeUrl,
  );

export const printBillViaBridge = ({
  bridgeUrl = getDefaultBridgeUrl(),
  printerName = "",
  cartItems,
  subtotal,
  tableLabel,
}) =>
  postToBridge(
    "/print-bill",
    withPrinterName({ cartItems, subtotal, tableLabel }, printerName),
    bridgeUrl,
  );
