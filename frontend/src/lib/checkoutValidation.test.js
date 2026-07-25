import test from "node:test";
import assert from "node:assert/strict";
import {
  checkoutRequiresPhone,
  getMissingCheckoutContactFields,
} from "./checkoutValidation.js";

test("physical and workshop orders require a phone number", () => {
  assert.equal(checkoutRequiresPhone({ requiresShipping: true }), true);
  assert.equal(checkoutRequiresPhone({ containsWorkshops: true }), true);
});

test("digital gift-card-only checkout keeps phone optional", () => {
  assert.equal(checkoutRequiresPhone({}), false);
  assert.deepEqual(
    getMissingCheckoutContactFields(
      { fullName: "Bethany Buyer", email: "buyer@example.com", phone: "" },
      {},
    ),
    [],
  );
});

test("required contact fields are reported conditionally", () => {
  assert.deepEqual(
    getMissingCheckoutContactFields(
      { fullName: "", email: "buyer@example.com", phone: "" },
      { containsWorkshops: true },
    ),
    ["fullName", "phone"],
  );
});
