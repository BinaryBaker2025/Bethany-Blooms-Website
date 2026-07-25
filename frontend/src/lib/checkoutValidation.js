export function checkoutRequiresPhone({
  requiresShipping = false,
  containsWorkshops = false,
} = {}) {
  return Boolean(requiresShipping || containsWorkshops);
}

export function getMissingCheckoutContactFields(
  contact = {},
  { requiresShipping = false, containsWorkshops = false } = {},
) {
  const required = ["fullName", "email"];
  if (checkoutRequiresPhone({ requiresShipping, containsWorkshops })) {
    required.push("phone");
  }
  return required.filter((field) => !(contact[field] || "").toString().trim());
}
