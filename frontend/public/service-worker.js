/* Service Worker for Image Caching and Offline Support */

const CACHE_VERSION = "bethany-blooms-v1";
const CACHE_NAMES = {
  images: `${CACHE_VERSION}-images`,
  static: `${CACHE_VERSION}-static`,
  pages: `${CACHE_VERSION}-pages`,
};

// Files to cache on install
const STATIC_ASSETS = [
  "/",
  "/index.html",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAMES.static).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.log("Static asset caching failed (expected for some assets):", err);
      });
    }),
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          const isOurCache = Object.values(CACHE_NAMES).includes(cacheName);
          if (!isOurCache) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

// Fetch event - implement cache strategies
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only cache GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip API calls and non-GET requests
  if (url.pathname.includes("/api/") || url.pathname.includes("/__/")) {
    return;
  }

  // Image caching strategy: Cache first, fallback to network
  if (isImageRequest(request)) {
    event.respondWith(
      caches.open(CACHE_NAMES.images).then((cache) => {
        return cache.match(request).then((response) => {
          if (response) {
            // Serve from cache immediately
            return response;
          }
          // Fetch from network and cache
          return fetch(request)
            .then((networkResponse) => {
              // Only cache successful responses
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                cache.put(request, responseToCache).catch(() => {
                  // Silently fail if caching fails (quota exceeded, etc.)
                });
              }
              return networkResponse;
            })
            .catch(() => {
              // Return fallback if both cache and network fail
              return caches.match("/");
            });
        });
      }),
    );
    return;
  }

  // HTML pages: Network first, fallback to cache
  if (isPageRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAMES.pages).then((cache) => {
              cache.put(request, responseToCache).catch(() => {
                // Silently fail
              });
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match("/");
          });
        }),
    );
    return;
  }

  // Static assets: Cache first
  if (isStaticRequest(request)) {
    event.respondWith(
      caches.open(CACHE_NAMES.static).then((cache) => {
        return cache.match(request).then((response) => {
          if (response) {
            return response;
          }
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                cache.put(request, responseToCache).catch(() => {
                  // Silently fail
                });
              }
              return networkResponse;
            })
            .catch(() => {
              // Return offline fallback
              return caches.match("/");
            });
        });
      }),
    );
  }
});

// Helper functions to determine request type
function isImageRequest(request) {
  const url = new URL(request.url);
  return /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(url.pathname);
}

function isPageRequest(request) {
  if (request.mode !== "navigate") {
    return false;
  }
  const url = new URL(request.url);
  // Cache HTML pages from our domain
  return request.headers.get("accept")?.includes("text/html");
}

function isStaticRequest(request) {
  const url = new URL(request.url);
  return /\.(js|css|woff|woff2|ttf|eot)(\?.*)?$/i.test(url.pathname);
}
