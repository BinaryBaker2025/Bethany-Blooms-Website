import { useState, useEffect, useRef } from "react";
import { getSharedImagePreloader } from "../hooks/useImagePreloader.js";

/**
 * Advanced image loader component with:
 * - Lazy loading via Intersection Observer
 * - Skeleton placeholder while loading
 * - Browser caching for fast subsequent loads
 * - Fade-in animation on load
 */
function ImageLoader({
  src,
  alt = "",
  className = "",
  containerClassName = "",
  onLoad = null,
  preloadOnce = false,
  fetchPriority = "auto",
  ...imgProps
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef(null);
  const preloaderRef = useRef(getSharedImagePreloader());

  // Set up Intersection Observer for lazy loading
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: "50px", // Start loading 50px before image enters viewport
        threshold: 0.01,
      },
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Preload the next images in the list
  useEffect(() => {
    if (preloadOnce && src && !isLoaded) {
      preloaderRef.current?.preloadImage(src, fetchPriority === "high" ? "high" : "low");
    }
  }, [src, preloadOnce, isLoaded, fetchPriority]);

  const handleImageLoad = () => {
    setIsLoaded(true);
    if (preloaderRef.current && src) {
      preloaderRef.current.preloadedCache.add(src);
    }
    if (onLoad) {
      onLoad();
    }
  };

  const isCached = preloaderRef.current?.isCached(src) || false;

  return (
    <div
      ref={containerRef}
      className={`image-loader ${isLoaded ? "is-loaded" : "is-loading"} ${isCached ? "is-cached" : ""} ${containerClassName}`.trim()}
    >
      {isVisible && (
        <img
          src={src}
          alt={alt}
          className={`${isLoaded ? "is-loaded" : ""} ${className}`.trim()}
          onLoad={handleImageLoad}
          fetchPriority={fetchPriority === "high" ? "high" : "auto"}
          {...imgProps}
        />
      )}
    </div>
  );
}

export default ImageLoader;
