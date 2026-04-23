import { useEffect, useCallback } from "react";
import { getSharedImagePreloader } from "./useImagePreloader.js";

/**
 * Hook for preloading a list of images with intelligent lookahead
 * Preloads the next N images as the user scrolls
 */
export const useImageListPreloader = (imageUrls = [], options = {}) => {
  const {
    lookaheadCount = 8, // Number of images to preload ahead
    priority = "low",
    enabled = true,
  } = options;

  const preloader = getSharedImagePreloader();

  // Preload visible and lookahead images
  const preloadVisibleAndLookahead = useCallback(() => {
    if (!enabled || !imageUrls.length) return;

    // Calculate which images are currently in view
    const scrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    const viewportEnd = scrollTop + windowHeight;

    // Get bounding info for all product cards if they exist
    const productCards = document.querySelectorAll(".product-card");
    let maxVisibleIndex = -1;

    productCards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const cardTop = scrollTop + rect.top;
      const cardBottom = scrollTop + rect.bottom;

      // If card is in or near viewport
      if (cardBottom >= scrollTop && cardTop <= viewportEnd) {
        maxVisibleIndex = Math.max(maxVisibleIndex, index);
      }
    });

    // Preload from current visible index up to lookahead count ahead
    const endIndex = Math.min(
      imageUrls.length,
      maxVisibleIndex + lookaheadCount + 1,
    );

    for (let i = 0; i < endIndex; i++) {
      if (imageUrls[i]) {
        preloader?.preloadImage(imageUrls[i], priority);
      }
    }
  }, [imageUrls, lookaheadCount, priority, enabled, preloader]);

  // Initial preload of first batch
  useEffect(() => {
    if (!enabled || !imageUrls.length) return;

    // Preload first batch immediately
    const initialBatch = Math.min(lookaheadCount, imageUrls.length);
    for (let i = 0; i < initialBatch; i++) {
      if (imageUrls[i]) {
        preloader?.preloadImage(imageUrls[i], "high");
      }
    }
  }, [imageUrls, lookaheadCount, enabled, preloader]);

  // Listen to scroll for progressive preloading
  useEffect(() => {
    if (!enabled) return;

    let scrollTimeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(preloadVisibleAndLookahead, 100);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [enabled, preloadVisibleAndLookahead]);

  return {
    preloadImage: preloader?.preloadImage,
    preloadImages: preloader?.preloadImages,
    isCached: preloader?.isCached,
  };
};
