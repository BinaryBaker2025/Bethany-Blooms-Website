/* Bethany Blooms production service worker.
 * __BUILD_VERSION__ is replaced in dist by vite.config.js on every build.
 */

const CACHE_PREFIX = "bethany-blooms-";
const CACHE_VERSION = "__BUILD_VERSION__";
const CACHE_NAMES = {
  images: `${CACHE_PREFIX}${CACHE_VERSION}-images`,
  assets: `${CACHE_PREFIX}${CACHE_VERSION}-assets`,
  pages: `${CACHE_PREFIX}${CACHE_VERSION}-pages`,
};

const DEVELOPMENT_PATH_PREFIXES = [
  "/@",
  "/src/",
  "/node_modules/",
];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith(CACHE_PREFIX) &&
                !Object.values(CACHE_NAMES).includes(cacheName),
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (isImageRequest(request)) {
      event.respondWith(cacheFirstImage(request));
    }
    return;
  }

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/__/") ||
    DEVELOPMENT_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isImageRequest(request)) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(cacheFirstStaticAsset(request));
  }
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAMES.pages);

  try {
    const response = await fetch(request);
    if (isHtmlResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cachedResponse = await cache.match(request);
    if (cachedResponse && isHtmlResponse(cachedResponse)) {
      return cachedResponse;
    }

    return new Response("Page unavailable while offline.", {
      status: 503,
      statusText: "Offline",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}

async function cacheFirstImage(request) {
  const cache = await caches.open(CACHE_NAMES.images);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const response = await fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.toLowerCase().startsWith("image/")) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", {
      status: 504,
      statusText: "Image unavailable",
      headers: { "Cache-Control": "no-store" },
    });
  }
}

async function cacheFirstStaticAsset(request) {
  const cache = await caches.open(CACHE_NAMES.assets);
  const cachedResponse = await cache.match(request);
  if (cachedResponse && isValidStaticAssetResponse(request, cachedResponse)) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    if (!isValidStaticAssetResponse(request, response)) {
      return invalidAssetResponse(request);
    }

    if (isHashedProductionAsset(request)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Static asset unavailable.", {
      status: 504,
      statusText: "Asset unavailable",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}

function invalidAssetResponse(request) {
  const pathname = new URL(request.url).pathname;
  return new Response(`Static asset not found: ${pathname}`, {
    status: 404,
    statusText: "Not Found",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function isHtmlResponse(response) {
  const contentType = response?.headers.get("content-type") || "";
  return response?.ok && contentType.toLowerCase().includes("text/html");
}

function isImageRequest(request) {
  const pathname = new URL(request.url).pathname;
  return /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(pathname);
}

function isStaticAssetRequest(request) {
  const pathname = new URL(request.url).pathname;
  return /\.(?:css|eot|js|json|map|mjs|otf|ttc|ttf|webmanifest|woff2?)$/i.test(
    pathname,
  );
}

function isHashedProductionAsset(request) {
  const pathname = new URL(request.url).pathname;
  return /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/i.test(pathname);
}

function isValidStaticAssetResponse(request, response) {
  if (!response?.ok) return false;

  const pathname = new URL(request.url).pathname.toLowerCase();
  const contentType = (
    response.headers.get("content-type") || ""
  ).toLowerCase();

  if (contentType.includes("text/html")) return false;
  if (/\.(?:js|mjs)$/.test(pathname)) {
    return (
      contentType.includes("javascript") ||
      contentType.includes("application/ecmascript")
    );
  }
  if (pathname.endsWith(".css")) return contentType.includes("text/css");
  if (pathname.endsWith(".json") || pathname.endsWith(".map")) {
    return contentType.includes("json");
  }
  if (pathname.endsWith(".webmanifest")) {
    return contentType.includes("manifest") || contentType.includes("json");
  }
  if (/\.(?:eot|otf|ttc|ttf|woff2?)$/.test(pathname)) {
    return (
      contentType.includes("font") ||
      contentType.includes("application/octet-stream")
    );
  }

  return true;
}
