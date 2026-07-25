import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveCatalogHeroImage,
  resolveProductsPageHeroImage,
} from "./catalogHero.js";

test("catalogue hero uses only the selected category cover", () => {
  assert.equal(
    resolveCatalogHeroImage({ coverImage: " https://example.com/hero.webp " }),
    "https://example.com/hero.webp",
  );
});

test("catalogue hero stays empty for loading, missing, and invalid states", () => {
  assert.equal(resolveCatalogHeroImage(null), "");
  assert.equal(resolveCatalogHeroImage({}), "");
  assert.equal(resolveCatalogHeroImage({ coverImage: "   " }), "");
  assert.equal(resolveCatalogHeroImage({ image: "pressed-flower.jpg" }), "");
});

test("the unfiltered all-products page uses its dedicated bundled hero", () => {
  assert.equal(
    resolveProductsPageHeroImage({
      allProductsImage: "/assets/all-products-hero.webp",
    }),
    "/assets/all-products-hero.webp",
  );
});

test("a category route never falls back to the all-products hero", () => {
  assert.equal(
    resolveProductsPageHeroImage({
      category: null,
      hasCategoryFilter: true,
      allProductsImage: "/assets/all-products-hero.webp",
    }),
    "",
  );
});
