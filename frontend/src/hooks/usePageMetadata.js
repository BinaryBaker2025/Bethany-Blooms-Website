import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  buildCanonicalUrl,
  getRobotsDirectiveForPath,
} from "../lib/seo.js";

const DEFAULT_SITE_NAME = "Bethany Blooms";
const DEFAULT_OG_TYPE = "website";
const DEFAULT_TWITTER_CARD = "summary_large_image";
const DEFAULT_OG_IMAGE_PATH = "/bradb-favicon.png";

function normalizeMetaValue(value) {
  if (value === undefined || value === null) return "";
  return value.toString().trim();
}

function getMetaContent(selector) {
  const element = document.querySelector(selector);
  return normalizeMetaValue(element?.getAttribute("content"));
}

function upsertMetaByName(name, content) {
  if (!name || !content) return;
  const selector = `meta[name="${name}"]`;
  const existing = document.querySelector(selector);
  if (existing) {
    existing.setAttribute("content", content);
    return;
  }
  const element = document.createElement("meta");
  element.setAttribute("name", name);
  element.setAttribute("content", content);
  document.head.appendChild(element);
}

function upsertMetaByProperty(property, content) {
  if (!property || !content) return;
  const selector = `meta[property="${property}"]`;
  const existing = document.querySelector(selector);
  if (existing) {
    existing.setAttribute("content", content);
    return;
  }
  const element = document.createElement("meta");
  element.setAttribute("property", property);
  element.setAttribute("content", content);
  document.head.appendChild(element);
}

function upsertCanonicalLink(href) {
  if (!href) return;
  const existing = document.querySelector('link[rel="canonical"]');
  if (existing) {
    existing.setAttribute("href", href);
    return;
  }
  const element = document.createElement("link");
  element.setAttribute("rel", "canonical");
  element.setAttribute("href", href);
  document.head.appendChild(element);
}

export function usePageMetadata({
  title,
  description,
  keywords,
  canonicalPath,
  canonicalUrl,
  robots,
  ogTitle,
  ogDescription,
  ogType,
  ogImage,
  ogUrl,
  twitterCard,
  twitterTitle,
  twitterDescription,
  twitterImage,
  noIndex,
} = {}) {
  const location = useLocation();

  useEffect(() => {
    const pathname = location?.pathname || "/";
    const nextTitle = normalizeMetaValue(title);
    if (nextTitle) {
      document.title = nextTitle;
    }

    const canonicalTarget = canonicalUrl || canonicalPath || pathname;
    const resolvedCanonical = buildCanonicalUrl(canonicalTarget);

    const explicitRobots = normalizeMetaValue(robots);
    const resolvedRobots =
      explicitRobots ||
      (typeof noIndex === "boolean"
        ? (noIndex ? "noindex,nofollow" : "index,follow")
        : getRobotsDirectiveForPath(pathname));

    const resolvedDescription =
      normalizeMetaValue(description) ||
      getMetaContent('meta[name="description"]');
    const resolvedKeywords = Array.isArray(keywords)
      ? keywords.map((entry) => normalizeMetaValue(entry)).filter(Boolean).join(", ")
      : normalizeMetaValue(keywords);
    const resolvedOgTitle =
      normalizeMetaValue(ogTitle) ||
      nextTitle ||
      getMetaContent('meta[property="og:title"]') ||
      "Bethany Blooms";
    const resolvedOgDescription =
      normalizeMetaValue(ogDescription) ||
      resolvedDescription;
    const resolvedOgType =
      normalizeMetaValue(ogType) || DEFAULT_OG_TYPE;
    const resolvedOgUrl = buildCanonicalUrl(
      normalizeMetaValue(ogUrl) || resolvedCanonical,
    );
    const resolvedOgImage = buildCanonicalUrl(
      normalizeMetaValue(ogImage) || DEFAULT_OG_IMAGE_PATH,
    );

    const resolvedTwitterCard =
      normalizeMetaValue(twitterCard) || DEFAULT_TWITTER_CARD;
    const resolvedTwitterTitle =
      normalizeMetaValue(twitterTitle) || resolvedOgTitle;
    const resolvedTwitterDescription =
      normalizeMetaValue(twitterDescription) || resolvedOgDescription;
    const resolvedTwitterImage = buildCanonicalUrl(
      normalizeMetaValue(twitterImage) || resolvedOgImage,
    );

    if (resolvedDescription) {
      upsertMetaByName("description", resolvedDescription);
    }
    if (resolvedKeywords) {
      upsertMetaByName("keywords", resolvedKeywords);
    }
    upsertMetaByName("robots", resolvedRobots);

    upsertMetaByProperty("og:title", resolvedOgTitle);
    if (resolvedOgDescription) {
      upsertMetaByProperty("og:description", resolvedOgDescription);
    }
    upsertMetaByProperty("og:type", resolvedOgType);
    upsertMetaByProperty("og:url", resolvedOgUrl);
    upsertMetaByProperty("og:image", resolvedOgImage);
    upsertMetaByProperty("og:site_name", DEFAULT_SITE_NAME);

    upsertMetaByName("twitter:card", resolvedTwitterCard);
    if (resolvedTwitterTitle) {
      upsertMetaByName("twitter:title", resolvedTwitterTitle);
    }
    if (resolvedTwitterDescription) {
      upsertMetaByName("twitter:description", resolvedTwitterDescription);
    }
    upsertMetaByName("twitter:image", resolvedTwitterImage);

    upsertCanonicalLink(resolvedCanonical);
  }, [
    location?.pathname,
    title,
    description,
    keywords,
    canonicalPath,
    canonicalUrl,
    robots,
    ogTitle,
    ogDescription,
    ogType,
    ogImage,
    ogUrl,
    twitterCard,
    twitterTitle,
    twitterDescription,
    twitterImage,
    noIndex,
  ]);
}
