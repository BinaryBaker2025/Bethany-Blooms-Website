import { useEffect, useRef, useCallback } from "react";

/**
 * Image preloader hook with intelligent caching and lazy loading
 * Preloads images as they enter the viewport to create a fast-feeling experience
 */
export const useImagePreloader = () => {
  const preloadedCache = useRef(new Set());
  const pendingPreloads = useRef(new Map());

  /**
   * Preload a single image into browser cache
   */
  const preloadImage = useCallback((src, priority = "low") => {
    if (!src || typeof src !== "string" || preloadedCache.current.has(src)) {
      return;
    }

    // Skip if already pending
    if (pendingPreloads.current.has(src)) {
      return;
    }

    // Mark as pending
    pendingPreloads.current.set(src, true);

    const img = new Image();
    img.decoding = "async";
    
    // Use fetchPriority if available (modern browsers)
    if ("fetchPriority" in img) {
      img.fetchPriority = priority;
    }

    img.onload = () => {
      preloadedCache.current.add(src);
      pendingPreloads.current.delete(src);
    };

    img.onerror = () => {
      pendingPreloads.current.delete(src);
    };

    img.src = src;
  }, []);

  /**
   * Batch preload multiple images
   */
  const preloadImages = useCallback((urls = [], priority = "low") => {
    urls.forEach((url) => preloadImage(url, priority));
  }, [preloadImage]);

  /**
   * Check if image is already cached
   */
  const isCached = useCallback((src) => {
    return preloadedCache.current.has(src);
  }, []);

  /**
   * Clear the cache
   */
  const clearCache = useCallback(() => {
    preloadedCache.current.clear();
    pendingPreloads.current.clear();
  }, []);

  return {
    preloadImage,
    preloadImages,
    isCached,
    clearCache,
  };
};

/**
 * Create a singleton instance to share across the app
 */
let sharedPreloader = null;

export const getSharedImagePreloader = () => {
  if (!sharedPreloader && typeof window !== "undefined") {
    sharedPreloader = {
      preloadedCache: new Set(),
      pendingPreloads: new Map(),

      preloadImage(src, priority = "low") {
        if (!src || typeof src !== "string" || this.preloadedCache.has(src)) {
          return;
        }

        if (this.pendingPreloads.has(src)) {
          return;
        }

        this.pendingPreloads.set(src, true);

        const img = new Image();
        img.decoding = "async";
        if ("fetchPriority" in img) {
          img.fetchPriority = priority;
        }

        img.onload = () => {
          this.preloadedCache.add(src);
          this.pendingPreloads.delete(src);
        };

        img.onerror = () => {
          this.pendingPreloads.delete(src);
        };

        img.src = src;
      },

      preloadImages(urls = [], priority = "low") {
        urls.forEach((url) => this.preloadImage(url, priority));
      },

      isCached(src) {
        return this.preloadedCache.has(src);
      },

      clearCache() {
        this.preloadedCache.clear();
        this.pendingPreloads.clear();
      },
    };
  }

  return sharedPreloader;
};
