const DEFAULT_SITE_URL = "https://bethanyblooms.co.za";

export const SITE_SEO_KEYWORDS = Object.freeze([
  "Bethany Blooms",
  "flower farm",
  "flower farm shop",
  "flower farm cafe",
  "flower farm coffee shop",
  "flower farm events",
  "flower farm workshops",
  "flower farm experiences",
  "flower farm Vereeniging",
  "flower farm South Africa",
  "florist Vereeniging",
  "fresh flowers",
  "fresh cut flowers Vereeniging",
  "cut flowers",
  "seasonal flowers",
  "locally grown flowers",
  "farm grown flowers",
  "flower bouquets",
  "flower arrangements",
  "dried flowers",
  "floral products",
  "flower delivery Vereeniging",
  "flower corms",
  "flower bulbs",
  "flower seeds",
  "garden seeds",
  "seasonal bulbs",
  "planting material",
  "seed shop",
  "corm shop",
  "grow your own flowers",
  "flower gardening",
  "farm shop",
  "farm store",
  "farm products",
  "local farm products",
  "artisan products",
  "garden products",
  "flower products",
  "locally made products",
  "gifts",
  "garden gifts",
  "farm coffee shop",
  "farm cafe",
  "coffee shop",
  "cafe",
  "farm to table cafe",
  "coffee and flowers",
  "breakfast",
  "brunch",
  "coffee and cake",
  "cafe experience",
  "floral services",
  "florist services",
  "flower delivery",
  "bouquet orders",
  "event flowers",
  "wedding flowers",
  "floral design",
  "flower subscriptions",
  "garden consultations",
  "flower growing advice",
  "flower workshops",
  "floral workshops",
  "flower arranging workshop",
  "bouquet making workshop",
  "flower farming workshop",
  "gardening workshops",
  "seed starting workshop",
  "bulb planting workshop",
  "dried flower workshop",
  "creative workshops",
  "farm events",
  "flower events",
  "flower festivals",
  "seasonal events",
  "special events",
  "farm experiences",
  "open farm days",
  "flower picking",
  "flower picking events",
  "private events",
  "community events",
  "weddings",
  "celebrations",
  "visit the flower farm",
  "flower farm experience",
  "farm visit",
  "family friendly",
  "things to do",
  "day out",
  "country escape",
  "rural experience",
  "nature experience",
  "garden experience",
  "agritourism",
  "farm tourism",
  "flower farm near me",
  "flower farm cafe near me",
  "flower shop near me",
  "farm shop near me",
  "flower workshops near me",
  "flower picking near me",
  "flower events near me",
  "coffee shop on a farm",
  "things to do near me",
  "farm experiences near me",
  "pressed flower workshops Gauteng",
  "pressed flower art South Africa",
  "pressed flower DIY kits",
  "flower tubers",
  "dahlia tubers",
  "fresh seasonal flowers",
  "floral gifts South Africa",
  "flower workshops Vereeniging",
]);

const INDEXABLE_ROUTE_PATTERNS = Object.freeze([
  /^\/$/,
  /^\/workshops$/,
  /^\/workshops\/[^/]+$/,
  /^\/cut-flowers$/,
  /^\/events$/,
  /^\/products$/,
  /^\/products\/[^/]+$/,
  /^\/gallery$/,
  /^\/contact$/,
  /^\/privacy-policy$/,
  /^\/disclaimer$/,
  /^\/subscriptions\/checkout$/,
]);

const NON_INDEXABLE_ROUTE_PATTERNS = Object.freeze([
  /^\/admin(?:\/|$)/,
  /^\/account(?:\/|$)/,
  /^\/payment(?:\/|$)/,
  /^\/gift-cards\/[^/]+$/,
  /^\/cart$/,
  /^\/checkout$/,
  /^\/design$/,
]);

function normalizePathname(input = "/") {
  const raw = (input || "").toString().trim();
  if (!raw) return "/";

  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname || "/";
    } catch {
      pathname = "/";
    }
  }

  const queryIndex = pathname.indexOf("?");
  const hashIndex = pathname.indexOf("#");
  const cutoffIndex = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((min, index) => Math.min(min, index), pathname.length);
  pathname = pathname.slice(0, cutoffIndex);

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  pathname = pathname.replace(/\/{2,}/g, "/");
  if (pathname.length > 1) {
    pathname = pathname.replace(/\/+$/, "");
  }

  return pathname || "/";
}

function normalizeAbsoluteUrl(input = "") {
  const raw = (input || "").toString().trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const normalizedPath = normalizePathname(parsed.pathname);
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return "";
  }
}

function getSiteOriginAndBasePath() {
  const siteUrl = getCanonicalSiteUrl();
  const parsed = new URL(siteUrl);
  const basePath = normalizePathname(parsed.pathname);
  return {
    origin: parsed.origin,
    basePath: basePath === "/" ? "" : basePath,
  };
}

export function getCanonicalSiteUrl() {
  const configured = (import.meta.env.VITE_SITE_URL || "").toString().trim();
  if (!configured) return DEFAULT_SITE_URL;
  const normalized =
    normalizeAbsoluteUrl(configured) ||
    normalizeAbsoluteUrl(`https://${configured}`);
  return normalized || DEFAULT_SITE_URL;
}

export function buildCanonicalUrl(pathOrUrl = "/") {
  const absolute = normalizeAbsoluteUrl(pathOrUrl);
  if (absolute) return absolute;

  const normalizedPath = normalizePathname(pathOrUrl);
  const { origin, basePath } = getSiteOriginAndBasePath();
  const combinedPath = normalizePathname(
    `${basePath}/${normalizedPath.replace(/^\/+/, "")}`,
  );
  return `${origin}${combinedPath}`;
}

export function isPathIndexable(pathname = "/") {
  const normalizedPath = normalizePathname(pathname);
  if (NON_INDEXABLE_ROUTE_PATTERNS.some((pattern) => pattern.test(normalizedPath))) {
    return false;
  }
  return INDEXABLE_ROUTE_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

export function getRobotsDirectiveForPath(pathname = "/") {
  return isPathIndexable(pathname) ? "index,follow" : "noindex,nofollow";
}

export function normalizeSeoPathname(pathname = "/") {
  return normalizePathname(pathname);
}
