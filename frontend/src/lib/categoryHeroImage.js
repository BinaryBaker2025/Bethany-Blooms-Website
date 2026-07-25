export const CATEGORY_HERO_MAX_WIDTH = 1920;
export const CATEGORY_HERO_MAX_HEIGHT = 1200;
export const CATEGORY_HERO_TARGET_BYTES = 500 * 1024;
export const CATEGORY_HERO_CACHE_CONTROL = "public,max-age=31536000,immutable";

const loadImageElement = (blob) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected cover image could not be decoded."));
    };
    image.src = objectUrl;
  });

const canvasToBlob = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The selected cover image could not be optimized."));
      },
      "image/webp",
      quality,
    );
  });

const fitInside = (width, height, maxWidth, maxHeight) => {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const getSourceBlob = async (source) => {
  if (source instanceof Blob) return source;
  const url = (source || "").toString().trim();
  if (!url) throw new Error("Choose a category cover image first.");
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) {
    throw new Error("The selected media-library image could not be downloaded for optimization.");
  }
  return response.blob();
};

const sanitizeBaseName = (value = "category-cover") =>
  value
    .toString()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "category-cover";

export async function optimizeCategoryHeroSource(source, { baseName } = {}) {
  const inputBlob = await getSourceBlob(source);
  const image = await loadImageElement(inputBlob);
  let dimensions = fitInside(
    image.naturalWidth,
    image.naturalHeight,
    CATEGORY_HERO_MAX_WIDTH,
    CATEGORY_HERO_MAX_HEIGHT,
  );

  const encode = async (width, height, quality) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser cannot optimize the selected image.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    return canvasToBlob(canvas, quality);
  };

  let output = await encode(dimensions.width, dimensions.height, 0.82);
  if (output.size > CATEGORY_HERO_TARGET_BYTES) {
    output = await encode(dimensions.width, dimensions.height, 0.72);
  }
  if (output.size > CATEGORY_HERO_TARGET_BYTES) {
    dimensions = fitInside(
      dimensions.width,
      dimensions.height,
      Math.min(1600, dimensions.width),
      Math.min(1000, dimensions.height),
    );
    output = await encode(dimensions.width, dimensions.height, 0.68);
  }

  const sourceName = source instanceof File ? source.name : baseName;
  const fileName = `${sanitizeBaseName(baseName || sourceName)}-${dimensions.width}x${dimensions.height}.webp`;
  const file = new File([output], fileName, {
    type: "image/webp",
    lastModified: Date.now(),
  });

  return {
    file,
    width: dimensions.width,
    height: dimensions.height,
    bytes: file.size,
    sourceBytes: inputBlob.size,
  };
}

export function isOptimizedCategoryHeroUrl(value = "") {
  const url = value.toString().trim();
  if (!url) return false;
  try {
    return decodeURIComponent(new URL(url).pathname).toLowerCase().endsWith(".webp");
  } catch {
    return url.split("?")[0].toLowerCase().endsWith(".webp");
  }
}
