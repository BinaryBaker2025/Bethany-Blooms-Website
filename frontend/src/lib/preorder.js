const PREORDER_SEND_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const normalizePreorderSendMonth = (value) => {
  const raw = (value || "").toString().trim();
  if (!raw) return "";
  const directMatch = PREORDER_SEND_MONTH_PATTERN.exec(raw);
  if (directMatch) return `${directMatch[1]}-${directMatch[2]}`;

  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) return "";
  const year = parsedDate.getUTCFullYear();
  const month = `${parsedDate.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
};

export const formatPreorderSendMonth = (value, locale = "en-ZA") => {
  const normalized = normalizePreorderSendMonth(value);
  if (!normalized) return "";
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";

  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
};

export const getProductPreorderSendMonth = (product = {}) =>
  normalizePreorderSendMonth(product.preorder_send_month || product.preorderSendMonth || "");
