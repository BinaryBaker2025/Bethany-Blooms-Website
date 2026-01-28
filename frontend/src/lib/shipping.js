export const SA_PROVINCES = [
  { value: "Eastern Cape", label: "Eastern Cape" },
  { value: "Free State", label: "Free State" },
  { value: "Gauteng", label: "Gauteng" },
  { value: "KwaZulu-Natal", label: "KwaZulu-Natal" },
  { value: "Limpopo", label: "Limpopo" },
  { value: "Mpumalanga", label: "Mpumalanga" },
  { value: "Northern Cape", label: "Northern Cape" },
  { value: "North West", label: "North West" },
  { value: "Western Cape", label: "Western Cape" },
];

export const formatShippingAddress = (address) => {
  if (!address) return "";
  const parts = [
    address.street,
    address.suburb,
    address.city,
    address.province,
    address.postalCode,
  ];
  return parts.map((value) => (value || "").toString().trim()).filter(Boolean).join(", ");
};

export const normalizeShippingAddress = (input = {}) => ({
  street: (input.street || input.streetAddress || "").toString().trim(),
  suburb: (input.suburb || "").toString().trim(),
  city: (input.city || "").toString().trim(),
  province: (input.province || "").toString().trim(),
  postalCode: (input.postalCode || input.postcode || "").toString().trim(),
});
