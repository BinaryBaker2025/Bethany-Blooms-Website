import { useEffect, useState } from "react";
import { preconnect, preload } from "react-dom";

const getOrigin = (value = "") => {
  try {
    return new URL(value, window.location.origin).origin;
  } catch {
    return "";
  }
};

function PriorityHeroImage({ src = "", className = "", alt = "", onReady }) {
  const imageUrl = (src || "").toString().trim();
  const [readyUrl, setReadyUrl] = useState("");
  const [failedUrl, setFailedUrl] = useState("");

  if (imageUrl) {
    preload(imageUrl, {
      as: "image",
      fetchPriority: "high",
    });
    const origin = typeof window !== "undefined" ? getOrigin(imageUrl) : "";
    if (origin && origin !== window.location.origin) {
      preconnect(origin, { crossOrigin: "anonymous" });
    }
  }

  useEffect(() => {
    setReadyUrl("");
    setFailedUrl("");
  }, [imageUrl]);

  if (!imageUrl || failedUrl === imageUrl) return null;

  const revealImage = (image) => {
    const markReady = () => {
      setReadyUrl(imageUrl);
      onReady?.(imageUrl);
    };

    if (typeof image.decode === "function") {
      image.decode().then(markReady).catch(markReady);
      return;
    }
    markReady();
  };

  return (
    <img
      key={imageUrl}
      className={`${className} ${readyUrl === imageUrl ? "is-loaded" : "is-loading"}`.trim()}
      src={imageUrl}
      alt={alt}
      aria-hidden={alt ? undefined : "true"}
      loading="eager"
      decoding="async"
      fetchPriority="high"
      onLoad={(event) => revealImage(event.currentTarget)}
      onError={() => setFailedUrl(imageUrl)}
    />
  );
}

export default PriorityHeroImage;
