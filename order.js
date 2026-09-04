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
  { id: "venmo", label: "Venmo" },
  { id: "apple-pay", label: "Apple Pay" },
  { id: "cash-app", label: "Cash App" },
];

export function paymentMethodLabel(id) {
  const match = PAYMENT_METHODS.find((method) => method.id === id);
  return match ? match.label : "";
}

export function normalizePaymentMethod(id) {
  return paymentMethodLabel(id) ? String(id) : "";
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
  return digits.length === 5 ? digits : "";
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
  const quote = orderQuote({ qty, fulfillment, zip });
  const isDelivery = fulfillment === "delivery";
  return {
    name: name == null ? "" : String(name),
    phone: phone == null ? "" : String(phone),
    fulfillment: fulfillment == null ? "pickup" : String(fulfillment),
    address: isDelivery && address != null ? String(address) : "",
    zip: isDelivery ? normalizeZip(zip) : "",
    notes: notes == null ? "" : String(notes),
    paymentMethod: normalizePaymentMethod(paymentMethod),
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
