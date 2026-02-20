const DEFAULT_SITE_URL = "https://bethanyblooms.co.za";

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
  /^\/subscriptions\/checkout$/,
]);

const NON_INDEXABLE_ROUTE_PATTERNS = Object.freeze([
  /^\/admin(?:\/|$)/,
  /^\/account(?:\/|$)/,
  /^\/payment(?:\/|$)/,
  /^\/gift-cards\/[^/]+$/,
  /^\/cart$/,
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
