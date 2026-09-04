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
