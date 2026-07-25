export function resolveCatalogHeroImage(category = null) {
  return (category?.coverImage || "").toString().trim();
}

export function resolveProductsPageHeroImage({
  category = null,
  hasCategoryFilter = false,
  allProductsImage = "",
} = {}) {
  if (hasCategoryFilter) return resolveCatalogHeroImage(category);
  return (allProductsImage || "").toString().trim();
}
