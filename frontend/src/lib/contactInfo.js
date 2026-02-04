export const COMPANY_PHONE_LOCAL_DISPLAY = "0744555590";
export const COMPANY_PHONE_TEL_HREF = "tel:+27744555590";
export const COMPANY_WHATSAPP_NUMBER_E164 = "27744555590";
export const COMPANY_WHATSAPP_BASE_URL = `https://wa.me/${COMPANY_WHATSAPP_NUMBER_E164}`;

export function buildWhatsAppLink(message = "") {
  const normalizedMessage = (message || "").toString().trim();
  if (!normalizedMessage) return COMPANY_WHATSAPP_BASE_URL;
  return `${COMPANY_WHATSAPP_BASE_URL}?text=${encodeURIComponent(normalizedMessage)}`;
}
