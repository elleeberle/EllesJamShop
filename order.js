import { sanitizeUrl } from "@braintree/sanitize-url";
import DOMPurify from "dompurify";
import serialize from "serialize-javascript";
import { zipIndexHas } from "./zipIndex.js";

export const JAM_PRODUCTS = [
  { id: "jam-8oz", name: "8oz jam", price: 9 },
  { id: "syrup-8oz", name: "8oz syrup", price: 8 },
  { id: "syrup-4oz", name: "4oz syrup", price: 5 },
];

export const BUTTER_PRODUCTS = [
  { id: "butter-8oz", name: "8oz butter", price: 9 },
  { id: "butter-12oz", name: "12oz butter", price: 12 },
];

export const JELLY_PRODUCTS = [
  { id: "jelly-8oz", name: "8oz jelly", price: 9 },
  { id: "jelly-12oz", name: "12oz jelly", price: 12 },
];

export const FLAVORS = [
  { id: "strawberry", name: "Strawberry", note: "Classic and sweet", products: JAM_PRODUCTS },
  { id: "blueberry", name: "Blueberry", note: "Bright and fruity", products: JAM_PRODUCTS },
  { id: "apple-butter", name: "Apple butter", note: "Warm spice", products: BUTTER_PRODUCTS },
  { id: "grape", name: "Grape", note: "Bold and jammy", products: JELLY_PRODUCTS },
  { id: "raspberry", name: "Raspberry", note: "Tart and bright", products: JAM_PRODUCTS },
  { id: "blackberry", name: "Blackberry", note: "Deep and rich", products: JAM_PRODUCTS },
];

export const PAYMENT_METHODS = [
  {
    id: "apple-pay",
    label: "Apple Pay",
    pickupOnly: true,
    note: "Apple Pay (in-person only)",
  },
  { id: "cash-app", label: "Cash App", handle: "$Jamerelle" },
  { id: "venmo", label: "Venmo", handle: "@Tychelle-Eberle" },
];

export const NAME_MAX_LENGTH = 80;
export const ADDRESS_MAX_LENGTH = 200;
export const NOTES_MAX_LENGTH = 280;
export const APPLE_PAY_DELIVERY_ERROR =
  "Apple Pay is only available for pickup orders.";

const PAYMENT_HOSTS = new Set([
  "venmo.com",
  "www.venmo.com",
  "cash.app",
  "www.cash.app",
]);

export function paymentMethodLabel(id) {
  const match = PAYMENT_METHODS.find((method) => method.id === id);
  return match ? match.label : "";
}

export function normalizeFulfillment(fulfillment) {
  return fulfillment === "delivery" ? "delivery" : "pickup";
}

export function isPaymentMethodAllowed(id, fulfillment) {
  const method = PAYMENT_METHODS.find((item) => item.id === id);
  if (!method) return false;
  if (method.pickupOnly && normalizeFulfillment(fulfillment) === "delivery") {
    return false;
  }
  return true;
}

export function normalizePaymentMethod(id, fulfillment) {
  return isPaymentMethodAllowed(id, fulfillment) ? String(id) : "";
}

export function paymentSubmitError(paymentMethod, fulfillment) {
  if (
    String(paymentMethod) === "apple-pay" &&
    normalizeFulfillment(fulfillment) === "delivery"
  ) {
    return APPLE_PAY_DELIVERY_ERROR;
  }
  return "";
}

export function sanitizeOrderText(value, maxLength) {
  if (value == null) return "";
  const cleaned = DOMPurify.sanitize(String(value), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
  const cap = Number.isFinite(maxLength) && maxLength >= 0 ? maxLength : NOTES_MAX_LENGTH;
  return cleaned.trim().slice(0, cap);
}

export function paymentAmount(total) {
  return clampNonNegative(total).toFixed(2);
}

export function venmoNote(notes) {
  const cleaned = sanitizeOrderText(notes, NOTES_MAX_LENGTH)
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Jam order";
}

export function isAllowedPaymentUrl(url) {
  if (!url || url === "about:blank") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && PAYMENT_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function paymentLink(methodId, total, notes) {
  const amount = paymentAmount(total);
  if (methodId === "venmo") {
    const base = sanitizeUrl("https://venmo.com/Tychelle-Eberle");
    if (!isAllowedPaymentUrl(base)) return "";
    const url = new URL(base);
    url.searchParams.set("txn", "pay");
    url.searchParams.set("amount", amount);
    url.searchParams.set("note", venmoNote(notes));
    return isAllowedPaymentUrl(url.toString()) ? url.toString() : "";
  }
  if (methodId === "cash-app") {
    const base = sanitizeUrl(`https://cash.app/$Jamerelle/${amount}`);
    return isAllowedPaymentUrl(base) ? base : "";
  }
  return "";
}

export function serializeOrderPayload(payload) {
  return serialize(payload, { isJSON: true });
}

export function safeNumber(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return value;
}

export function clampNonNegative(n) {
  return Math.max(0, safeNumber(n));
}

export function currency(n) {
  return clampNonNegative(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function getQty(qty, flavorId, productId) {
  if (qty == null || typeof qty !== "object") return 0;
  const flavorQty = qty[flavorId];
  if (flavorQty == null || typeof flavorQty !== "object") return 0;
  return clampNonNegative(flavorQty[productId]);
}

export function applyQtyChange(qty, flavorId, productId, delta) {
  const prev = qty != null && typeof qty === "object" ? qty : {};
  const flavorQty =
    prev[flavorId] != null && typeof prev[flavorId] === "object"
      ? prev[flavorId]
      : {};
  const next = clampNonNegative(getQty(prev, flavorId, productId) + safeNumber(delta));
  return {
    ...prev,
    [flavorId]: { ...flavorQty, [productId]: next },
  };
}

export function flavorSubtotal(qty, flavor) {
  if (!flavor?.products?.length) return 0;
  return flavor.products.reduce(
    (sum, product) =>
      sum + getQty(qty, flavor.id, product?.id) * clampNonNegative(product?.price),
    0
  );
}

export function orderLines(qty) {
  const lines = [];
  for (const flavor of FLAVORS) {
    for (const product of flavor.products) {
      const n = getQty(qty, flavor.id, product.id);
      if (n > 0) {
        lines.push({
          key: `${flavor.id}-${product.id}`,
          label: `${flavor.name} ${product.name}`,
          n,
          amount: n * clampNonNegative(product.price),
        });
      }
    }
  }
  return lines;
}

export function orderTotals(qty) {
  const lines = orderLines(qty);
  return {
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.n, 0),
    total: lines.reduce((sum, line) => sum + line.amount, 0),
  };
}

export const SMALL_BOX_SLOTS = 6;
export const SHIPPING_CAP = 25;

export function productSlots(productId) {
  const match = String(productId ?? "").match(/(\d+)\s*oz/i);
  if (!match) return 0;
  const oz = Number(match[1]);
  if (!Number.isFinite(oz) || oz <= 0) return 0;
  if (oz === 4) return 1;
  if (oz === 8) return 2;
  if (oz === 12) return 3;
  return Math.ceil(oz / 4);
}

export function packingSlots(qty) {
  let slots = 0;
  for (const flavor of FLAVORS) {
    for (const product of flavor.products) {
      slots += getQty(qty, flavor.id, product.id) * productSlots(product.id);
    }
  }
  return slots;
}

export function estimatedBoxes(qty) {
  const slots = packingSlots(qty);
  if (slots <= 0) return 0;
  return Math.ceil(slots / SMALL_BOX_SLOTS);
}

export function normalizeZip(zip) {
  const digits = String(zip ?? "").replace(/\D/g, "").slice(0, 5);
  if (digits.length !== 5 || !zipIndexHas(digits)) return "";
  return digits;
}

export function phoneDigits(phone) {
  return String(phone ?? "").replace(/\D/g, "").slice(0, 10);
}

export function normalizePhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length === 10 ? digits : "";
}

export function formatPhone(phone) {
  const digits = phoneDigits(phone);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function phoneDigitsBeforeCaret(value, caret) {
  return String(value ?? "")
    .slice(0, Math.max(0, caret ?? 0))
    .replace(/\D/g, "").length;
}

export function caretFromDigitCount(formatted, digitCount) {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return formatted.length;
}

export function applyPhoneInputChange(
  prevFormatted,
  nextRaw,
  caret,
  inputType
) {
  const prevDigits = phoneDigits(prevFormatted);
  let nextDigits = phoneDigits(nextRaw);
  let digitCaret = phoneDigitsBeforeCaret(nextRaw, caret);

  if (
    nextDigits.length === prevDigits.length &&
    String(nextRaw ?? "").length < String(prevFormatted ?? "").length
  ) {
    if (inputType === "deleteContentForward") {
      nextDigits =
        nextDigits.slice(0, digitCaret) + nextDigits.slice(digitCaret + 1);
    } else {
      nextDigits =
        nextDigits.slice(0, Math.max(0, digitCaret - 1)) +
        nextDigits.slice(digitCaret);
      digitCaret = Math.max(0, digitCaret - 1);
    }
  }

  const formatted = formatPhone(nextDigits);
  return {
    formatted,
    caret: caretFromDigitCount(formatted, digitCaret),
  };
}

function prefixInRange(prefix, start, end) {
  return prefix >= start && prefix <= end;
}

export function zoneFromZip(zip) {
  const digits = normalizeZip(zip);
  if (!digits) return 0;
  const prefix = Number(digits.slice(0, 3));
  const first = Number(digits[0]);

  if (prefix === 379) return 1;
  if (prefixInRange(prefix, 370, 385)) return 2;

  if (
    prefixInRange(prefix, 300, 319) ||
    prefixInRange(prefix, 350, 369) ||
    prefixInRange(prefix, 270, 289) ||
    prefixInRange(prefix, 290, 299) ||
    prefixInRange(prefix, 400, 427) ||
    prefixInRange(prefix, 220, 246) ||
    prefixInRange(prefix, 386, 397) ||
    prefixInRange(prefix, 716, 729)
  ) {
    return 3;
  }

  if (first === 2 || first === 3 || first === 4) return 4;
  if (first === 5 || first === 6 || first === 7) return 5;
  if (first === 0 || first === 1) return 6;
  if (first === 8) return 7;
  if (first === 9) return 8;
  return 0;
}

export function smallBoxRate(zone) {
  const z = clampNonNegative(zone);
  if (z >= 1 && z <= 3) return 11;
  if (z >= 4 && z <= 5) return 14;
  if (z >= 6 && z <= 8) return 20;
  return 0;
}

export function shippingQuote({ qty, fulfillment, zip } = {}) {
  if (fulfillment !== "delivery") {
    return { cost: 0, boxes: 0, zone: 0 };
  }
  const boxes = estimatedBoxes(qty);
  if (boxes === 0) {
    return { cost: 0, boxes: 0, zone: 0 };
  }
  const zone = zoneFromZip(zip);
  if (zone === 0) {
    return { cost: 0, boxes, zone: 0 };
  }
  const cost = Math.min(boxes * smallBoxRate(zone), SHIPPING_CAP);
  return { cost, boxes, zone };
}

export function orderQuote({ qty, fulfillment, zip } = {}) {
  const { lines, itemCount, total: itemTotal } = orderTotals(qty);
  const shipping = shippingQuote({ qty, fulfillment, zip });
  return {
    lines,
    itemCount,
    itemTotal,
    shipping,
    total: itemTotal + shipping.cost,
  };
}

export function buildOrderNotification({
  qty,
  name,
  phone,
  fulfillment,
  address,
  zip,
  notes,
  paymentMethod,
} = {}) {
  const normalizedFulfillment = normalizeFulfillment(fulfillment);
  const quote = orderQuote({ qty, fulfillment: normalizedFulfillment, zip });
  const isDelivery = normalizedFulfillment === "delivery";
  return {
    name: sanitizeOrderText(name, NAME_MAX_LENGTH),
    phone: formatPhone(phone),
    fulfillment: normalizedFulfillment,
    address: isDelivery ? sanitizeOrderText(address, ADDRESS_MAX_LENGTH) : "",
    zip: isDelivery ? normalizeZip(zip) : "",
    notes: sanitizeOrderText(notes, NOTES_MAX_LENGTH),
    paymentMethod: normalizePaymentMethod(paymentMethod, normalizedFulfillment),
    lines: quote.lines,
    itemCount: quote.itemCount,
    itemTotal: quote.itemTotal,
    shipping: {
      cost: quote.shipping.cost,
      estimatedBoxes: quote.shipping.boxes,
      zone: quote.shipping.zone,
    },
    total: quote.total,
  };
}
