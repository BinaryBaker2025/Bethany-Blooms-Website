import test from "node:test";
import assert from "node:assert/strict";
import { getBuyNowCartConflict } from "./buyNowCart.js";

test("Buy Now preserves compatible product cart items", () => {
  const items = [
    {
      itemType: "product",
      metadata: { type: "product", stockStatus: "in" },
    },
  ];
  assert.equal(
    getBuyNowCartConflict(items, {
      incomingType: "product",
      incomingPreorder: false,
    }),
    "",
  );
});

test("Buy Now blocks workshop/product type conflicts", () => {
  const items = [{ itemType: "workshop", metadata: { type: "workshop" } }];
  assert.match(
    getBuyNowCartConflict(items, { incomingType: "product" }),
    /workshops or products/i,
  );
});

test("Buy Now blocks preorder and in-stock mixing", () => {
  const items = [
    {
      itemType: "product",
      metadata: { type: "product", stockStatus: "preorder" },
    },
  ];
  assert.match(
    getBuyNowCartConflict(items, {
      incomingType: "product",
      incomingPreorder: false,
    }),
    /separate orders/i,
  );
});

test("gift cards do not create a preorder compatibility conflict", () => {
  const items = [
    {
      itemType: "product",
      metadata: { type: "product", stockStatus: "preorder" },
    },
  ];
  assert.equal(
    getBuyNowCartConflict(items, {
      incomingType: "product",
      incomingGiftCard: true,
    }),
    "",
  );
});
