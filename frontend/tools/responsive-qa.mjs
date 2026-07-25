import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BROWSER_PATH =
  process.env.QA_BROWSER_PATH ||
  process.env.EDGE_PATH ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_NAME = process.env.QA_BROWSER_NAME || "Microsoft Edge headless";
const BASE_URL = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = path.resolve(process.env.QA_OUTPUT_DIR || "qa-artifacts");
const PROFILE_DIR = path.join(tmpdir(), `bethany-blooms-qa-${Date.now()}`);
const DEBUG_PORT = Number(process.env.QA_DEBUG_PORT || 9339);

await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(PROFILE_DIR, { recursive: true });

const browser = spawn(
  BROWSER_PATH,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
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
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
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
let requestedUrls = [];

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
    requestedUrls.push(message.params.request.url);
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

function waitForEvent(method, timeoutMs = 15000) {
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
    throw new Error(result.exceptionDetails.text || "Browser evaluation failed.");
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

async function navigate(url) {
  requestedUrls = [];
  const loaded = waitForEvent("Page.domContentEventFired", 60000);
  await send("Page.navigate", { url });
  await loaded;
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

async function capture(name) {
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(path.join(OUTPUT_DIR, `${name}.png`), screenshot.data, "base64");
}

const heroProbe = `(() => {
  const hero = document.querySelector(".page-hero");
  const image = document.querySelector(".page-hero__bg");
  const buttons = [...document.querySelectorAll(".page-hero .btn")];
  const rect = hero?.getBoundingClientRect();
  return {
    title: document.querySelector(".page-hero h1")?.textContent?.trim() || "",
    imageSrc: image?.currentSrc || image?.src || "",
    imageClass: image?.className || "",
    imageOpacity: image ? getComputedStyle(image).opacity : null,
    loading: image?.loading || null,
    fetchPriority: image?.fetchPriority || null,
    heroHeight: rect?.height || 0,
    heroWidth: rect?.width || 0,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    cls: globalThis.__qaCLS || 0,
    buttonHeights: buttons.map((button) => Math.round(button.getBoundingClientRect().height)),
  };
})()`;

const checkoutProbe = `(() => {
  const sections = [...document.querySelectorAll("#checkout-form .checkout-step")];
  const mobileAction = document.querySelector(".cart-page__sticky-bar");
  const desktopAction = document.querySelector(".checkout-form__submit");
  const whatsapp = document.querySelector(".floating-whatsapp");
  const phone = document.querySelector('input[name="tel"]');
  return {
    heading: document.querySelector(".cart-page__header h1")?.textContent?.trim() || "",
    sectionCount: sections.length,
    visibleSectionCount: sections.filter((section) => getComputedStyle(section).display !== "none").length,
    reviewPresent: document.body.textContent.includes("Confirm your details before placing the order"),
    payfastCheckboxPresent: Boolean(document.querySelector('input[type="checkbox"]')),
    whatsappPresent: Boolean(whatsapp),
    phoneRequired: Boolean(phone?.required),
    fieldNames: [...document.querySelectorAll("#checkout-form input, #checkout-form select")]
      .map((field) => field.name)
      .filter(Boolean),
    primaryLabels: [...document.querySelectorAll('#checkout-form button[type="submit"], .cart-page__sticky-bar button[type="submit"]')]
      .filter((button) => button.offsetParent !== null)
      .map((button) => button.textContent.trim()),
    mobileActionPosition: mobileAction ? getComputedStyle(mobileAction).position : null,
    mobileActionHeight: mobileAction ? Math.round(mobileAction.getBoundingClientRect().height) : 0,
    desktopActionDisplay: desktopAction ? getComputedStyle(desktopAction).display : null,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  };
})()`;

const checkoutSummaryProbe = `(() => {
  const rect = (element) => {
    const value = element?.getBoundingClientRect();
    return value
      ? {
          x: Math.round(value.x),
          y: Math.round(value.y),
          width: Math.round(value.width),
          height: Math.round(value.height),
          right: Math.round(value.right),
          bottom: Math.round(value.bottom),
        }
      : null;
  };
  const summary = document.querySelector(".cart-page__summary");
  const card = document.querySelector(".cart-page__summary-inner");
  const grid = document.querySelector(".cart-page__grid");
  const footer = document.querySelector(".footer");
  const summaryStyle = summary ? getComputedStyle(summary) : null;
  const cardStyle = card ? getComputedStyle(card) : null;
  const ancestors = [];
  for (let element = summary?.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    ancestors.push({
      tag: element.tagName.toLowerCase(),
      id: element.id || "",
      className:
        typeof element.className === "string" ? element.className : "",
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      transform: style.transform,
      contain: style.contain,
      height: style.height,
    });
  }
  const totalRows = [...document.querySelectorAll(".cart-page__total-row")];
  const readTotalRow = (label) =>
    totalRows
      .find((row) => row.firstElementChild?.textContent?.trim() === label)
      ?.lastElementChild?.textContent?.trim() || "";
  return {
    scrollY: Math.round(scrollY),
    summary: rect(summary),
    card: rect(card),
    grid: rect(grid),
    footer: rect(footer),
    summaryPosition: summaryStyle?.position || null,
    summaryTop: summaryStyle?.top || null,
    summaryMaxHeight: summaryStyle?.maxHeight || null,
    cardOverflowY: cardStyle?.overflowY || null,
    cardMaxHeight: cardStyle?.maxHeight || null,
    cardScrollable: Boolean(card && card.scrollHeight > card.clientHeight),
    scrollingElement: document.scrollingElement?.tagName.toLowerCase() || null,
    ancestors,
    items: readTotalRow("Items"),
    shipping: readTotalRow("Shipping"),
    total: readTotalRow("Total"),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  };
})()`;

const summaryIsAtStickyTop = (value) => {
  const expectedTop = Number.parseFloat(value?.summaryTop);
  return (
    value?.summaryPosition === "sticky" &&
    Number.isFinite(expectedTop) &&
    Math.abs((value?.summary?.y || 0) - expectedTop) <= 2
  );
};

const filtersProbe = `(() => {
  const rect = (element) => {
    const value = element?.getBoundingClientRect();
    return value
      ? {
          x: Math.round(value.x),
          y: Math.round(value.y),
          width: Math.round(value.width),
          height: Math.round(value.height),
          right: Math.round(value.right),
          bottom: Math.round(value.bottom),
        }
      : null;
  };
  const container = document.querySelector(".shop-filters");
  const bar = document.querySelector(".shop-filters__bar");
  const search = document.querySelector(".shop-filters__search");
  const searchWrap = document.querySelector(".shop-filters__search-wrap");
  const sort = document.querySelector(".shop-filters__sort");
  const toggle = document.querySelector(".shop-filters__toggle");
  const chips = document.querySelector(".shop-filters__chips");
  const chipItems = [...document.querySelectorAll(".shop-filters__chips .shop-chip")];
  const categorySelect = document.querySelector(
    ".shop-filters__category-select--toolbar"
  );
  const meta = document.querySelector(".shop-filters__meta");
  const containerRect = rect(container);
  const searchRect = rect(search);
  const searchWrapRect = rect(searchWrap);
  const sortRect = rect(sort);
  const toggleRect = rect(toggle);
  const chipsStyle = chips ? getComputedStyle(chips) : null;
  return {
    viewportWidth: innerWidth,
    container: containerRect,
    search: searchRect,
    searchWrap: searchWrapRect,
    sort: sortRect,
    toggle: toggleRect,
    chips: rect(chips),
    categorySelect: rect(categorySelect),
    meta: rect(meta),
    barDisplay: bar ? getComputedStyle(bar).display : null,
    inputFontSize: search ? getComputedStyle(search).fontSize : null,
    categoryChipCount: chipItems.length,
    chipMinHeight: chipItems.length
      ? Math.min(...chipItems.map((chip) => Math.round(chip.getBoundingClientRect().height)))
      : 0,
    chipsFlexWrap: chipsStyle?.flexWrap || null,
    chipsOverflowX: chipsStyle?.overflowX || null,
    chipsScrollable: Boolean(chips && chips.scrollWidth > chips.clientWidth),
    chipsScrollWidth: chips?.scrollWidth || 0,
    chipsClientWidth: chips?.clientWidth || 0,
    categorySelectVisible: Boolean(categorySelect?.offsetParent),
    categorySelectDisplay: categorySelect
      ? getComputedStyle(categorySelect).display
      : null,
    categorySelectFontSize: categorySelect
      ? getComputedStyle(categorySelect).fontSize
      : null,
    categorySelectOptionCount: categorySelect?.options?.length || 0,
    selectedCategoryValue: categorySelect?.value || "",
    controlsShareRow: Boolean(
      sortRect &&
        toggleRect &&
        Math.abs(sortRect.y - toggleRect.y) <= 1 &&
        sortRect.right <= toggleRect.x
    ),
    equalControlHeights: Boolean(
      sortRect && toggleRect && Math.abs(sortRect.height - toggleRect.height) <= 1
    ),
    searchOwnRow: Boolean(
      searchWrapRect &&
        sortRect &&
        searchWrapRect.bottom <= sortRect.y &&
        searchWrapRect.width > sortRect.width
    ),
    controlsInsideViewport: [
      containerRect,
      searchRect,
      sortRect,
      toggleRect,
      rect(categorySelect),
    ]
      .filter(Boolean)
      .every((value) => value.x >= -1 && value.right <= innerWidth + 1),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    activeChipText:
      document.querySelector(".shop-filters__chips .shop-chip--active")
        ?.textContent?.trim() || "",
    productCount: meta?.querySelector("span")?.textContent?.trim() || "",
    clearVisible: Boolean(document.querySelector(".shop-filters__clear")),
  };
})()`;

const report = {
  baseUrl: BASE_URL,
  browser: BROWSER_NAME,
  freshProfile: PROFILE_DIR,
  hero: {},
  filters: {},
  productDetail: {},
  checkout: {},
};

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setBypassServiceWorker", { bypass: true });
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      globalThis.__qaCLS = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) globalThis.__qaCLS += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    `,
  });

  for (const viewport of [
    { name: "all-products-desktop-1440x900", width: 1440, height: 900, mobile: false },
    { name: "all-products-iphone-390x844", width: 390, height: 844, mobile: true },
  ]) {
    await setViewport(viewport.width, viewport.height, viewport.mobile);
    await navigate(`${BASE_URL}/products?qa=all-products-${Date.now()}`);
    report.hero[viewport.name] = await poll(
      heroProbe,
      (value) =>
        value?.imageClass?.includes("is-loaded") && value?.imageOpacity === "1",
      25000,
    );
    report.hero[viewport.name].allProductsHeroRequested = requestedUrls.some(
      (url) => url.includes("all-products-hero"),
    );
    report.hero[viewport.name].pressedFlowerRequested = requestedUrls.some(
      (url) => url.includes("workshop-frame-purple"),
    );
    await capture(`hero-${viewport.name}`);
  }

  await setViewport(412, 915, true);
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 350,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (128 * 1024) / 8,
    connectionType: "cellular3g",
  });
  await navigate(
    `${BASE_URL}/products?category=dahlia-tubers-bethany-blooms-grown&qa=${Date.now()}`,
  );
  const slowInitial = await poll(
    heroProbe,
    (value) => Boolean(value?.imageSrc),
    12000,
  );
  report.hero.slowMobileInitial = {
    ...slowInitial,
    pressedFlowerRequested: requestedUrls.some((url) =>
      url.includes("workshop-frame-purple"),
    ),
  };

  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
    connectionType: "none",
  });
  report.hero.slowMobileLoaded = await poll(
    heroProbe,
    (value) =>
      value?.imageClass?.includes("is-loaded") && value?.imageOpacity === "1",
    25000,
  );
  await capture("hero-android-412x915");

  for (const viewport of [
    { name: "desktop-1440x900", width: 1440, height: 900, mobile: false },
    { name: "tablet-1024x1366", width: 1024, height: 1366, mobile: false },
    { name: "iphone-390x844", width: 390, height: 844, mobile: true },
  ]) {
    await setViewport(viewport.width, viewport.height, viewport.mobile);
    await navigate(
      `${BASE_URL}/products?category=dahlia-tubers-bethany-blooms-grown&qa=${Date.now()}`,
    );
    report.hero[viewport.name] = await poll(
      heroProbe,
      (value) =>
        value?.imageClass?.includes("is-loaded") && value?.imageOpacity === "1",
      25000,
    );
    report.hero[viewport.name].pressedFlowerRequested = requestedUrls.some((url) =>
      url.includes("workshop-frame-purple"),
    );
    await capture(`hero-${viewport.name}`);
  }

  for (const viewport of [
    { name: "mobile-320", width: 320, height: 720, mobile: true },
    { name: "mobile-360", width: 360, height: 800, mobile: true },
    { name: "mobile-390", width: 390, height: 844, mobile: true },
    { name: "mobile-430", width: 430, height: 932, mobile: true },
    { name: "mobile-768", width: 768, height: 1024, mobile: true },
    { name: "desktop-1280", width: 1280, height: 900, mobile: false },
  ]) {
    await setViewport(viewport.width, viewport.height, viewport.mobile);
    await navigate(`${BASE_URL}/products?qa=filters-${viewport.width}-${Date.now()}`);
    report.filters[viewport.name] = await poll(
      filtersProbe,
      (value) => value?.categorySelectOptionCount > 1,
      20000,
    );
    await evaluate(
      `document.querySelector(".shop-filters")?.scrollIntoView({ block: "start" })`,
    );
    await delay(180);
    if (["mobile-320", "mobile-390", "mobile-768", "desktop-1280"].includes(viewport.name)) {
      await capture(`filters-${viewport.name}`);
    }
  }

  await setViewport(390, 844, true);
  await navigate(`${BASE_URL}/products?qa=filter-interactions-${Date.now()}`);
  await poll(filtersProbe, (value) => value?.categorySelectOptionCount > 1, 20000);
  await evaluate(
    `document.querySelector(".shop-filters")?.scrollIntoView({ block: "start" })`,
  );
  await evaluate(`(() => {
    const select = document.querySelector(".shop-filters__category-select--toolbar");
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )?.set;
    valueSetter?.call(select, select?.options?.[1]?.value || "");
    select?.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  report.filters.interactions = {
    toolbarCategoryUrl: await poll(
      `location.href`,
      (value) => value.includes("category="),
      10000,
    ),
  };
  await evaluate(`(() => {
    const select = document.querySelector(".shop-filters__category-select--toolbar");
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )?.set;
    valueSetter?.call(select, "");
    select?.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await poll(
    `location.href`,
    (value) => !value.includes("category="),
    10000,
  );

  await evaluate(`(() => {
    const input = document.querySelector(".shop-filters__search");
    if (!input) return;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    valueSetter?.call(input, "Craspedia");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await evaluate(`(() => {
    const select = document.querySelector(".shop-filters__sort");
    if (!select) return;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )?.set;
    valueSetter?.call(select, "price-asc");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  report.filters.interactions.searchAndSortUrl = await poll(
    `location.href`,
    (value) => value.includes("q=Craspedia") && value.includes("sort=price-asc"),
    10000,
  );

  await evaluate(`document.querySelector(".shop-filters__toggle")?.click()`);
  report.filters.interactions.open = await poll(
    `(() => {
      const panel = document.querySelector(".shop-filters__panel");
      const apply = document.querySelector(".shop-filters__apply");
      const close = document.querySelector(".shop-filters__panel-close");
      const panelRect = panel?.getBoundingClientRect();
      return {
        panelVisible: Boolean(panel),
        panelPosition: panel ? getComputedStyle(panel).position : null,
        panelWidth: panelRect ? Math.round(panelRect.width) : 0,
        panelHeight: panelRect ? Math.round(panelRect.height) : 0,
        bodyScrollLocked: document.body.style.overflow === "hidden",
        applyWidth: apply ? Math.round(apply.getBoundingClientRect().width) : 0,
        applyHeight: apply ? Math.round(apply.getBoundingClientRect().height) : 0,
        closeHeight: close ? Math.round(close.getBoundingClientRect().height) : 0,
        hasCategoryControls:
          document.querySelector(
            ".shop-filters__category-select--panel"
          )?.options?.length > 1,
      };
    })()`,
    (value) => value?.panelVisible && value?.bodyScrollLocked,
    10000,
  );
  await capture("filters-mobile-sheet-390");

  await evaluate(
    `document.querySelector(".shop-filters__panel-close")?.click()`,
  );
  report.filters.interactions.close = await poll(
    `(() => ({
      panelVisible: Boolean(document.querySelector(".shop-filters__panel")),
      bodyScrollLocked: document.body.style.overflow === "hidden",
      toggleExpanded:
        document.querySelector(".shop-filters__toggle")?.getAttribute("aria-expanded")
    }))()`,
    (value) => !value?.panelVisible && !value?.bodyScrollLocked,
    10000,
  );

  await evaluate(`document.querySelector(".shop-filters__toggle")?.click()`);
  await poll(
    `Boolean(document.querySelector(".shop-filters__panel"))`,
    Boolean,
    10000,
  );
  await evaluate(`(() => {
    const stockButton = [...document.querySelectorAll(".shop-filters__panel .shop-chip")]
      .find((button) => button.textContent.trim() === "In stock");
    stockButton?.click();
  })()`);
  await poll(
    `location.href`,
    (value) => value.includes("stock=in"),
    10000,
  );
  await evaluate(`(() => {
    const select = document.querySelector(".shop-filters__category-select--panel");
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )?.set;
    valueSetter?.call(select, select?.options?.[1]?.value || "");
    select?.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  report.filters.interactions.activeSelections = await poll(
    `(() => ({
      url: location.href,
      dotVisible: Boolean(document.querySelector(".shop-filters__dot")),
      selectedPanelChips: [...document.querySelectorAll(
        ".shop-filters__panel .shop-chip--active"
      )].map((chip) => chip.textContent.trim()),
      selectedCategory:
        document.querySelector(".shop-filters__category-select--panel")?.value || ""
    }))()`,
    (value) =>
      value?.url?.includes("stock=in") &&
      value?.url?.includes("category=") &&
      value?.dotVisible,
    10000,
  );

  await evaluate(`document.querySelector(".shop-filters__apply")?.click()`);
  const appliedUrl = await poll(
    `location.href`,
    (value) =>
      value.includes("stock=in") &&
      value.includes("category=") &&
      !value.includes("product-filter-panel"),
    10000,
  );
  report.filters.interactions.applied = {
    url: appliedUrl,
    panelVisible: await evaluate(
      `Boolean(document.querySelector(".shop-filters__panel"))`,
    ),
    bodyScrollLocked: await evaluate(
      `document.body.style.overflow === "hidden"`,
    ),
    meta: await evaluate(filtersProbe),
  };

  await evaluate(`history.back()`);
  report.filters.interactions.backUrl = await poll(
    `location.href`,
    (value) => value !== appliedUrl,
    10000,
  );
  await evaluate(`history.forward()`);
  report.filters.interactions.forwardUrl = await poll(
    `location.href`,
    (value) => value === appliedUrl,
    10000,
  );

  await evaluate(`document.querySelector(".shop-filters__clear")?.click()`);
  report.filters.interactions.cleared = await poll(
    filtersProbe,
    (value) => value?.selectedCategoryValue === "" && !value?.clearVisible,
    10000,
  );

  await setViewport(1280, 900, false);
  await navigate(`${BASE_URL}/products?qa=desktop-panel-${Date.now()}`);
  await poll(filtersProbe, (value) => value?.categorySelectOptionCount > 1, 20000);
  await evaluate(`document.querySelector(".shop-filters__toggle")?.click()`);
  report.filters.desktopPanel = await poll(
    `(() => {
      const panel = document.querySelector(".shop-filters__panel");
      const header = document.querySelector(".shop-filters__panel-header");
      const footer = document.querySelector(".shop-filters__panel-footer");
      return {
        position: panel ? getComputedStyle(panel).position : null,
        headerDisplay: header ? getComputedStyle(header).display : null,
        footerDisplay: footer ? getComputedStyle(footer).display : null,
        bodyScrollLocked: document.body.style.overflow === "hidden",
        backdropDisplay: document.querySelector(".shop-filters__backdrop")
          ? getComputedStyle(document.querySelector(".shop-filters__backdrop")).display
          : null,
      };
    })()`,
    (value) => value?.position === "static",
    10000,
  );

  await setViewport(390, 844, true);
  await navigate(`${BASE_URL}/products?qa=buy-now-${Date.now()}`);
  const productLinks = await poll(
    `(() => [...new Set([...document.querySelectorAll('a[href^="/products/"]')]
      .map((link) => link.getAttribute("href"))
      .filter((href) => /^\\/products\\/[^/]+$/.test(href || "")))])()`,
    (value) => Array.isArray(value) && value.length > 0,
    20000,
  );
  let buyNowCartSnapshot = "";
  for (const href of productLinks.slice(0, 8)) {
    await navigate(`${BASE_URL}${href}?qa=${Date.now()}`);
    const detail = await poll(
      `(() => ({
        title: document.querySelector(".product-detail h1")?.textContent?.trim() || "",
        actions: [...document.querySelectorAll(".product-detail__actions button, .product-detail__actions a")]
          .map((control) => control.textContent.trim())
      }))()`,
      (value) => Boolean(value?.title),
      15000,
    );
    if (!detail.actions.includes("Buy Now")) continue;
    report.productDetail = { href, ...detail };
    await evaluate(
      `[...document.querySelectorAll(".product-detail__actions button")]
        .find((button) => button.textContent.trim() === "Buy Now")?.click()`,
    );
    report.productDetail.buyNowDestination = await poll(
      `location.pathname`,
      (value) => value === "/checkout",
      10000,
    );
    report.productDetail.cartCountAfterBuyNow = await evaluate(
      `JSON.parse(localStorage.getItem("bethany-blooms-cart") || "[]")
        .reduce((total, item) => total + (Number(item.quantity) || 0), 0)`,
    );
    buyNowCartSnapshot = await evaluate(
      `localStorage.getItem("bethany-blooms-cart") || ""`,
    );
    break;
  }

  await setViewport(390, 844, true);
  await navigate(`${BASE_URL}/?qa=${Date.now()}`);
  await evaluate(`localStorage.setItem("bethany-blooms-cart", JSON.stringify([{
    id: "qa-physical-product",
    name: "QA physical product",
    price: 250,
    quantity: 1,
    itemType: "product",
    metadata: {
      type: "product",
      productId: "qa-physical-product",
      stockStatus: "in",
      stockQuantity: 10,
      isGiftCard: false
    }
  }]))`);
  await navigate(`${BASE_URL}/checkout?qa=${Date.now()}`);
  report.checkout.iphone = await poll(
    checkoutProbe,
    (value) => value?.sectionCount === 3,
    15000,
  );
  await capture("checkout-iphone-390x844");
  await evaluate(`document.getElementById("checkout-form")?.scrollIntoView({ block: "start" })`);
  await delay(250);
  await capture("checkout-iphone-form-390x844");

  await evaluate(`localStorage.setItem("bethany-blooms-cart", JSON.stringify([{
    id: "qa-gift-card",
    name: "QA digital gift card",
    price: 250,
    quantity: 1,
    itemType: "product",
    metadata: {
      type: "product",
      productId: "qa-gift-card",
      isGiftCard: true,
      giftCard: { isGiftCard: true }
    }
  }]))`);
  await navigate(`${BASE_URL}/checkout?qa=gift-${Date.now()}`);
  report.checkout.digitalGiftIphone = await poll(
    checkoutProbe,
    (value) => value?.heading === "Checkout",
    15000,
  );

  const desktopCartSnapshot =
    buyNowCartSnapshot ||
    JSON.stringify([
      {
        id: "qa-physical-product",
        name: "QA physical product",
        price: 250,
        quantity: 1,
        itemType: "product",
        metadata: {
          type: "product",
          productId: "qa-physical-product",
          stockStatus: "in",
          stockQuantity: 10,
          isGiftCard: false,
        },
      },
    ]);

  await setViewport(1440, 900, false);
  await evaluate(
    `localStorage.setItem("bethany-blooms-cart", ${JSON.stringify(desktopCartSnapshot)})`,
  );
  await navigate(`${BASE_URL}/checkout?qa=${Date.now()}`);
  report.checkout.desktop = await poll(
    checkoutProbe,
    (value) => value?.sectionCount === 3,
    15000,
  );
  report.checkout.desktopSummaryInitial = await evaluate(checkoutSummaryProbe);
  const desktopSummaryInitialX =
    report.checkout.desktopSummaryInitial?.summary?.x ?? null;
  await evaluate(`(() => {
    const grid = document.querySelector(".cart-page__grid");
    if (!grid) return;
    const gridTop = grid.getBoundingClientRect().top + scrollY;
    scrollTo(0, gridTop + 360);
  })()`);
  report.checkout.desktopSummaryScrolled = await poll(
    checkoutSummaryProbe,
    summaryIsAtStickyTop,
    10000,
  );
  report.checkout.desktopSummaryScrolled.horizontalPositionStable =
    desktopSummaryInitialX ===
    report.checkout.desktopSummaryScrolled?.summary?.x;

  const quantityBefore = {
    items: report.checkout.desktopSummaryScrolled.items,
    total: report.checkout.desktopSummaryScrolled.total,
  };
  const quantityIncreaseAvailable = await poll(
    `(() => {
      const button = document.querySelector(
        'button[aria-label^="Increase quantity"]'
      );
      return Boolean(button && !button.disabled);
    })()`,
    Boolean,
    15000,
  );
  if (quantityIncreaseAvailable) {
    await evaluate(
      `document.querySelector('button[aria-label^="Increase quantity"]')?.click()`,
    );
  }
  report.checkout.quantityUpdateWhileSticky = await poll(
    checkoutSummaryProbe,
    (value) =>
      !quantityIncreaseAvailable ||
      value?.items !== quantityBefore.items ||
      value?.total !== quantityBefore.total,
    10000,
  );
  report.checkout.quantityUpdateWhileSticky.available =
    quantityIncreaseAvailable;

  await evaluate(`(() => {
    const select = document.querySelector('select[name="address-level1"]');
    if (!select) return;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )?.set;
    valueSetter?.call(select, "Gauteng");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  report.checkout.shippingOptions = await poll(
    `(() => {
      const container = document.querySelector(".checkout-courier");
      const options = [
        ...document.querySelectorAll('input[name="courier"]')
      ];
      return {
        province:
          document.querySelector('select[name="address-level1"]')?.value || "",
        optionCount: options.length,
        loading: container?.textContent?.includes("Loading courier options") || false,
        error: container?.querySelector(".admin-panel__error")?.textContent?.trim() || ""
      };
    })()`,
    (value) => value?.province === "Gauteng" && !value?.loading,
    15000,
  );
  if (report.checkout.shippingOptions.optionCount > 0) {
    await evaluate(`document.querySelector('input[name="courier"]')?.click()`);
    report.checkout.shippingOptions.summaryAfterSelection = await poll(
      checkoutSummaryProbe,
      (value) =>
        Boolean(value?.shipping) && value.shipping !== "Select a courier",
      10000,
    );
  }
  await capture("checkout-desktop-1440x900");

  await evaluate(`(() => {
    const source = JSON.parse(${JSON.stringify(desktopCartSnapshot)});
    const item = source[0];
    const longCart = Array.from({ length: 8 }, (_, index) => ({
      ...item,
      id: String(item.id) + "-qa-" + String(index + 1),
      name: String(item.name) + " " + String(index + 1),
      quantity: 1,
    }));
    localStorage.setItem("bethany-blooms-cart", JSON.stringify(longCart));
  })()`);
  await setViewport(1280, 720, false);
  await navigate(`${BASE_URL}/checkout?qa=long-${Date.now()}`);
  await poll(
    `document.querySelectorAll(".cart-list__item").length`,
    (value) => value >= 8,
    15000,
  );
  report.checkout.longLaptopInitial = await evaluate(checkoutSummaryProbe);
  const longSummaryInitialX = report.checkout.longLaptopInitial?.summary?.x ?? null;
  await evaluate(`(() => {
    const grid = document.querySelector(".cart-page__grid");
    if (!grid) return;
    scrollTo(0, grid.getBoundingClientRect().top + scrollY + 520);
  })()`);
  report.checkout.longLaptopSticky = await poll(
    checkoutSummaryProbe,
    summaryIsAtStickyTop,
    10000,
  );
  report.checkout.longLaptopSticky.horizontalPositionStable =
    longSummaryInitialX === report.checkout.longLaptopSticky?.summary?.x;
  await capture("checkout-sticky-laptop-1280x720");

  await evaluate(`scrollTo(0, document.documentElement.scrollHeight)`);
  await delay(180);
  report.checkout.longLaptopNearFooter = await evaluate(checkoutSummaryProbe);
  report.checkout.longLaptopNearFooter.overlapsFooter = Boolean(
    report.checkout.longLaptopNearFooter?.summary &&
      report.checkout.longLaptopNearFooter?.footer &&
      report.checkout.longLaptopNearFooter.summary.bottom >
        report.checkout.longLaptopNearFooter.footer.y,
  );

  for (const viewport of [
    { name: "largeDesktop", width: 1600, height: 1000, sticky: true },
    { name: "tabletLandscape", width: 1024, height: 768, sticky: true },
    { name: "tabletPortrait", width: 768, height: 1024, sticky: false },
    { name: "android", width: 412, height: 915, sticky: false },
    { name: "mobile", width: 390, height: 844, sticky: false },
  ]) {
    await setViewport(viewport.width, viewport.height, viewport.width <= 768);
    await navigate(
      `${BASE_URL}/checkout?qa=summary-${viewport.name}-${Date.now()}`,
    );
    await poll(
      checkoutSummaryProbe,
      (value) => Boolean(value?.summary),
      15000,
    );
    await evaluate(`(() => {
      const grid = document.querySelector(".cart-page__grid");
      if (!grid) return;
      scrollTo(0, grid.getBoundingClientRect().top + scrollY + 420);
    })()`);
    report.checkout[viewport.name] = await poll(
      checkoutSummaryProbe,
      (value) =>
        viewport.sticky
          ? summaryIsAtStickyTop(value)
          : value?.summaryPosition === "static",
      10000,
    );
  }

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
