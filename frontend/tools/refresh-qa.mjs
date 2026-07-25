import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BROWSER_PATH =
  process.env.QA_BROWSER_PATH ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_NAME = process.env.QA_BROWSER_NAME || "Microsoft Edge headless";
const BASE_URL = process.env.QA_BASE_URL || "http://127.0.0.1:5005";
const OUTPUT_DIR = path.resolve(
  process.env.QA_OUTPUT_DIR || "qa-artifacts/refresh",
);
const PROFILE_DIR = path.join(
  tmpdir(),
  `bethany-blooms-refresh-qa-${Date.now()}`,
);
const DEBUG_PORT = Number(process.env.QA_DEBUG_PORT || 9350);

const ROUTES = [
  "/",
  "/products",
  "/products/craspedia-seeds",
  "/cart",
  "/checkout",
  "/workshops",
  "/cut-flowers",
  "/events",
  "/gallery",
  "/gift-cards",
  "/contact",
  "/account",
  "/admin",
  "/products?category=dahlia-tubers-bethany-blooms-grown&sort=price-asc",
  "/products/craspedia-seeds?ref=refresh-qa",
];

await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(PROFILE_DIR, { recursive: true });

const browser = spawn(
  BROWSER_PATH,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${DEBUG_PORT}/json/list`,
      );
      if (response.ok) return response.json();
    } catch {
      // Browser is still starting.
    }
    await delay(100);
  }
  throw new Error(`${BROWSER_NAME} remote debugging did not become available.`);
}

const targets = await waitForDebugger();
const target = targets.find((entry) => entry.type === "page");
if (!target?.webSocketDebuggerUrl) {
  browser.kill();
  throw new Error("No browser page target was available.");
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
const eventWaiters = new Map();
const requests = new Map();
let responses = [];
let exceptions = [];
let consoleErrors = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
    return;
  }

  if (message.method === "Network.requestWillBeSent") {
    requests.set(message.params.requestId, {
      url: message.params.request.url,
      type: message.params.type,
      initiator: message.params.initiator,
    });
  }

  if (message.method === "Network.responseReceived") {
    const request = requests.get(message.params.requestId) || {};
    responses.push({
      url: message.params.response.url,
      status: message.params.response.status,
      mimeType: message.params.response.mimeType,
      contentType:
        message.params.response.headers["content-type"] ||
        message.params.response.headers["Content-Type"] ||
        "",
      type: message.params.type || request.type || "",
      fromServiceWorker: message.params.response.fromServiceWorker || false,
      fromDiskCache: message.params.response.fromDiskCache || false,
      initiator: request.initiator || null,
    });
  }

  if (message.method === "Runtime.exceptionThrown") {
    exceptions.push(
      message.params.exceptionDetails.exception?.description ||
        message.params.exceptionDetails.text ||
        "Unknown browser exception",
    );
  }

  if (
    message.method === "Log.entryAdded" &&
    message.params.entry.level === "error"
  ) {
    consoleErrors.push(message.params.entry.text);
  }

  const waiters = eventWaiters.get(message.method);
  if (!waiters?.length) return;
  eventWaiters.delete(message.method);
  waiters.forEach((resolve) => resolve(message.params));
});

function send(method, params = {}) {
  commandId += 1;
  return new Promise((resolve, reject) => {
    pending.set(commandId, { resolve, reject });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
}

function waitForEvent(method, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${method}`)),
      timeoutMs,
    );
    const wrapped = (value) => {
      clearTimeout(timeout);
      resolve(value);
    };
    eventWaiters.set(method, [...(eventWaiters.get(method) || []), wrapped]);
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "Browser evaluation failed.",
    );
  }
  return result.result.value;
}

async function poll(expression, predicate, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await evaluate(expression);
    if (predicate(value)) return value;
    await delay(100);
  }
  return evaluate(expression);
}

function resetDiagnostics() {
  requests.clear();
  responses = [];
  exceptions = [];
  consoleErrors = [];
}

async function navigate(url, { hard = false } = {}) {
  resetDiagnostics();
  if (hard) {
    await send("Network.setCacheDisabled", { cacheDisabled: true });
  }
  const loaded = waitForEvent("Page.domContentEventFired").then(
    () => true,
    () => false,
  );
  await send("Page.navigate", { url });
  await Promise.race([loaded, delay(10000)]);
  await poll(`document.readyState !== "loading"`, Boolean, 10000);
  await send("Network.setCacheDisabled", { cacheDisabled: false });
}

async function reload({ hard = false } = {}) {
  resetDiagnostics();
  const loaded = waitForEvent("Page.domContentEventFired").then(
    () => true,
    () => false,
  );
  await send("Page.reload", { ignoreCache: hard });
  await Promise.race([loaded, delay(10000)]);
  await poll(`document.readyState !== "loading"`, Boolean, 10000);
}

async function waitForApplication() {
  return poll(
    `(() => {
      const cart = document.querySelector(".cart-button");
      const cartRect = cart?.getBoundingClientRect();
      const documentElement = document.documentElement;
      const publicShellReady = Boolean(
        document.querySelector(".site-header") &&
        document.querySelector("#main-content")
      );
      const adminShellReady = Boolean(
        document.querySelector(".admin-auth, .adm-shell")
      );
      return {
        header: Boolean(document.querySelector(".site-header")),
        main: Boolean(document.querySelector("#main-content")),
        shellReady: publicShellReady || adminShellReady,
        adminShell: adminShellReady,
        rootTextLength: document.querySelector("#root")?.textContent?.trim().length || 0,
        serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
        mobileCartVisible: Boolean(
          cart &&
          cartRect &&
          cartRect.width >= 44 &&
          cartRect.height >= 44 &&
          cartRect.left >= 0 &&
          cartRect.right <= (documentElement?.clientWidth || 0)
        ),
        mobileCartWidth: cartRect?.width || 0,
        mobileCartHeight: cartRect?.height || 0,
        horizontalOverflow:
          Boolean(
            documentElement &&
            documentElement.scrollWidth > documentElement.clientWidth + 1
          ),
        url: location.href
      };
    })()`,
    (value) => value.shellReady && value.rootTextLength > 20,
    20000,
  );
}

function collectDiagnostics(appState) {
  const assetResponses = responses.filter((response) =>
    response.type === "Script" ||
    response.type === "Stylesheet" ||
    /\.(?:css|js|mjs)(?:\?|$)/i.test(response.url),
  );
  const htmlAssetResponses = assetResponses.filter((response) =>
    `${response.mimeType} ${response.contentType}`
      .toLowerCase()
      .includes("text/html"),
  );
  const developmentRequests = responses.filter((response) =>
    /(?:@react-refresh|\/@vite\/client|\/src\/|\/node_modules\/\.vite\/)/.test(
      response.url,
    ),
  );
  const reactErrors = [...exceptions, ...consoleErrors].filter((message) =>
    /Invalid hook call|Unexpected token '<'|reading 'useState'|useState.*null/i.test(
      message,
    ),
  );

  return {
    appState,
    assetResponseCount: assetResponses.length,
    htmlAssetResponses,
    developmentRequests,
    exceptions,
    consoleErrors,
    reactErrors,
  };
}

async function setViewport(width, height, mobile = false) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

async function runRoute(route) {
  const url = new URL(route, BASE_URL).href;
  await navigate(url);
  const direct = collectDiagnostics(await waitForApplication());
  await reload();
  const normalRefresh = collectDiagnostics(await waitForApplication());
  await reload({ hard: true });
  const hardRefresh = collectDiagnostics(await waitForApplication());
  return { route, direct, normalRefresh, hardRefresh };
}

async function probeStaleDevelopmentAsset(querySuffix) {
  resetDiagnostics();
  await evaluate(`new Promise((resolve) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/node_modules/.vite/deps/react-dom_client.js?v=${querySuffix}";
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", resolve, { once: true });
    document.head.append(script);
  })`);
  await delay(250);
  return (
    responses.find((response) =>
      response.url.includes("/node_modules/.vite/deps/react-dom_client.js"),
    ) || null
  );
}

const report = {
  baseUrl: BASE_URL,
  browser: BROWSER_NAME,
  profile: PROFILE_DIR,
  routes: [],
  serviceWorker: {},
  mobile: {},
  staleDevelopmentAssetProbeWithWorker: null,
  staleDevelopmentAssetProbe: null,
};

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");
  await send("Network.setBypassServiceWorker", { bypass: false });
  await send("Network.setCacheDisabled", { cacheDisabled: false });
  await setViewport(1440, 900, false);

  await navigate(new URL("/", BASE_URL).href);
  await waitForApplication();
  report.serviceWorker.afterInitialLoad = await poll(
    `navigator.serviceWorker.getRegistrations().then((registrations) => ({
      registrationCount: registrations.length,
      controlled: Boolean(navigator.serviceWorker.controller),
      scriptUrls: registrations.map((registration) =>
        registration.active?.scriptURL ||
        registration.waiting?.scriptURL ||
        registration.installing?.scriptURL ||
        ""
      )
    }))`,
    (value) => value.registrationCount > 0,
    20000,
  );

  for (const route of ROUTES) {
    report.routes.push(await runRoute(route));
  }

  await navigate(new URL("/?worker-probe=1", BASE_URL).href);
  await waitForApplication();
  await poll(
    `navigator.serviceWorker.ready.then(() => Boolean(navigator.serviceWorker.controller))`,
    Boolean,
    20000,
  );
  report.staleDevelopmentAssetProbeWithWorker =
    await probeStaleDevelopmentAsset("stale-refresh-qa-worker");

  report.serviceWorker.beforeUnregister = await evaluate(
    `Promise.all([
      navigator.serviceWorker.getRegistrations(),
      caches.keys()
    ]).then(([registrations, cacheNames]) => ({
      registrationCount: registrations.length,
      controlled: Boolean(navigator.serviceWorker.controller),
      cacheNames
    }))`,
  );

  report.serviceWorker.unregisterResult = await evaluate(
    `Promise.all([
      navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      ),
      caches.keys().then((cacheNames) =>
        Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
      )
    ]).then(() => true)`,
  );

  await navigate(new URL("/contact?without-service-worker=1", BASE_URL).href, {
    hard: true,
  });
  report.serviceWorker.afterUnregister = collectDiagnostics(
    await waitForApplication(),
  );

  await setViewport(412, 915, true);
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 250,
    downloadThroughput: 500 * 1024,
    uploadThroughput: 150 * 1024,
    connectionType: "cellular4g",
  });
  await navigate(
    new URL(
      "/products?category=dahlia-tubers-bethany-blooms-grown&mobile=1",
      BASE_URL,
    ).href,
  );
  report.mobile.androidDirect = collectDiagnostics(await waitForApplication());
  await reload();
  report.mobile.androidRefresh = collectDiagnostics(await waitForApplication());
  await setViewport(390, 844, true);
  await reload({ hard: true });
  report.mobile.iphoneHardRefresh = collectDiagnostics(
    await waitForApplication(),
  );
  await setViewport(360, 800, true);
  await reload();
  report.mobile.phone360Refresh = collectDiagnostics(await waitForApplication());
  await setViewport(320, 720, true);
  await reload({ hard: true });
  report.mobile.phone320HardRefresh = collectDiagnostics(
    await waitForApplication(),
  );
  await setViewport(768, 1024, true);
  await reload();
  report.mobile.tabletPortraitRefresh = collectDiagnostics(
    await waitForApplication(),
  );
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
    connectionType: "none",
  });

  report.staleDevelopmentAssetProbe =
    await probeStaleDevelopmentAsset("stale-refresh-qa-no-worker");

  await writeFile(
    path.join(OUTPUT_DIR, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket.close();
  browser.kill();
}
