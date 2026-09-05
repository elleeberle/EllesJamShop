import {
  ADDRESS_MAX_LENGTH,
  FLAVORS,
  NAME_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  applyPhoneInputChange,
  applyQtyChange,
  buildOrderNotification,
  clampNonNegative,
  currency,
  estimatedBoxes,
  flavorSubtotal,
  formatPhone,
  getQty,
  isPaymentMethodAllowed,
  normalizePaymentMethod,
  normalizePhone,
  normalizeZip,
  orderLines,
  orderQuote,
  orderTotals,
  packingSlots,
  paymentAmount,
  paymentLink,
  paymentSubmitError,
  productSlots,
  safeNumber,
  sanitizeOrderText,
  serializeOrderPayload,
  shippingQuote,
  smallBoxRate,
  venmoNote,
  zoneFromZip,
  orderSummaryText,
} from "../order.js";
import { setZipIndexForTests } from "../zipIndex.js";
import { TEST_ZIPS } from "./testZips.js";

const strawberry = FLAVORS.find((f) => f.id === "strawberry");
const appleButter = FLAVORS.find((f) => f.id === "apple-butter");

test("flavors are listed alphabetically by name", () => {
  const names = FLAVORS.map((flavor) => flavor.name);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

beforeEach(() => {
  setZipIndexForTests(TEST_ZIPS);
});

function repeatChange(times, qty, flavorId, productId, delta) {
  let next = qty;
  for (let i = 0; i < times; i += 1) {
    next = applyQtyChange(next, flavorId, productId, delta);
  }
  return next;
}

describe("safeNumber and clampNonNegative", () => {
  test.each([null, undefined, NaN, Infinity, -Infinity, "", "abc", {}, []])(
    "treats %p as 0",
    (value) => {
      expect(safeNumber(value)).toBe(0);
      expect(clampNonNegative(value)).toBe(0);
    }
  );

  test("does not allow negatives", () => {
    expect(clampNonNegative(-1)).toBe(0);
    expect(clampNonNegative(-9.5)).toBe(0);
  });
});

describe("currency", () => {
  test("formats a positive dollar amount", () => {
    expect(currency(9)).toBe("$9.00");
    expect(currency(23)).toBe("$23.00");
  });

  test.each([null, undefined, NaN, Infinity, -4, "-9"])(
    "never returns null, undefined, or a negative amount for %p",
    (value) => {
      const formatted = currency(value);
      expect(formatted).toBe("$0.00");
      expect(formatted).not.toMatch(/null|undefined|NaN|-/i);
    }
  );
});

describe("getQty", () => {
  test.each([
    [null, "strawberry", "jam-8oz"],
    [undefined, "strawberry", "jam-8oz"],
    [{}, "strawberry", "jam-8oz"],
    [{ strawberry: null }, "strawberry", "jam-8oz"],
    [{ strawberry: undefined }, "strawberry", "jam-8oz"],
    [{ strawberry: { "jam-8oz": null } }, "strawberry", "jam-8oz"],
    [{ strawberry: { "jam-8oz": undefined } }, "strawberry", "jam-8oz"],
    [{ strawberry: { "jam-8oz": -3 } }, "strawberry", "jam-8oz"],
    [{ strawberry: { "jam-8oz": NaN } }, "strawberry", "jam-8oz"],
  ])("returns 0 for invalid qty state %j", (qty, flavorId, productId) => {
    expect(getQty(qty, flavorId, productId)).toBe(0);
  });
});

describe("flavorSubtotal", () => {
  test("returns 0 for missing flavor or qty", () => {
    expect(flavorSubtotal(null, strawberry)).toBe(0);
    expect(flavorSubtotal(undefined, strawberry)).toBe(0);
    expect(flavorSubtotal({}, null)).toBe(0);
    expect(flavorSubtotal({}, undefined)).toBe(0);
    expect(flavorSubtotal({}, {})).toBe(0);
  });

  test("matches count times price for each product in a subsection", () => {
    const qty = {
      strawberry: { "jam-8oz": 2, "syrup-8oz": 1, "syrup-4oz": 3 },
    };
    expect(flavorSubtotal(qty, strawberry)).toBe(2 * 9 + 1 * 8 + 3 * 5);
  });

  test("ignores negative and non-numeric counts", () => {
    const qty = {
      strawberry: { "jam-8oz": -2, "syrup-8oz": null, "syrup-4oz": undefined },
    };
    expect(flavorSubtotal(qty, strawberry)).toBe(0);
  });

  test.each(FLAVORS)("starts at $0.00 for the $name subsection", (flavor) => {
    expect(flavorSubtotal({}, flavor)).toBe(0);
    expect(currency(flavorSubtotal({}, flavor))).toBe("$0.00");
  });
});

describe("applyQtyChange", () => {
  test("rapid successive increments keep count aligned with subtotal", () => {
    const qty = repeatChange(7, {}, "strawberry", "jam-8oz", 1);

    expect(getQty(qty, "strawberry", "jam-8oz")).toBe(7);
    expect(flavorSubtotal(qty, strawberry)).toBe(63);
    expect(orderTotals(qty).itemCount).toBe(7);
    expect(orderTotals(qty).total).toBe(63);
  });

  test("rapid mixed clicks across products keep subsection math consistent", () => {
    let qty = {};
    qty = repeatChange(4, qty, "strawberry", "jam-8oz", 1);
    qty = repeatChange(3, qty, "strawberry", "syrup-4oz", 1);
    qty = repeatChange(2, qty, "strawberry", "jam-8oz", -1);
    qty = applyQtyChange(qty, "apple-butter", "butter-12oz", 1);

    expect(getQty(qty, "strawberry", "jam-8oz")).toBe(2);
    expect(getQty(qty, "strawberry", "syrup-4oz")).toBe(3);
    expect(flavorSubtotal(qty, strawberry)).toBe(2 * 9 + 3 * 5);
    expect(flavorSubtotal(qty, appleButter)).toBe(12);
    expect(orderTotals(qty).itemCount).toBe(6);
    expect(orderTotals(qty).total).toBe(2 * 9 + 3 * 5 + 12);
  });

  test("will not go negative no matter how many times decrease is applied", () => {
    let qty = applyQtyChange({}, "grape", "jelly-8oz", 1);
    qty = repeatChange(12, qty, "grape", "jelly-8oz", -1);

    expect(getQty(qty, "grape", "jelly-8oz")).toBe(0);
    expect(flavorSubtotal(qty, FLAVORS.find((f) => f.id === "grape"))).toBe(0);
  });

  test("recovers from null, undefined, and negative existing state", () => {
    expect(getQty(applyQtyChange(null, "blueberry", "jam-8oz", 1), "blueberry", "jam-8oz")).toBe(1);
    expect(
      getQty(applyQtyChange(undefined, "blueberry", "jam-8oz", 1), "blueberry", "jam-8oz")
    ).toBe(1);
    expect(
      getQty(
        applyQtyChange({ blueberry: { "jam-8oz": -4 } }, "blueberry", "jam-8oz", 1),
        "blueberry",
        "jam-8oz"
      )
    ).toBe(1);
  });
});

describe("orderLines", () => {
  test("omits empty, negative, and invalid quantities", () => {
    const lines = orderLines({
      strawberry: { "jam-8oz": 2, "syrup-8oz": 0, "syrup-4oz": -1 },
      blueberry: null,
    });

    expect(lines).toEqual([
      {
        key: "strawberry-jam-8oz",
        label: "Strawberry 8oz jam",
        n: 2,
        amount: 18,
      },
    ]);
    expect(lines.every((line) => line.n > 0 && line.amount > 0)).toBe(true);
  });
});

describe("packing slots and boxes", () => {
  test("maps jar volume to packing slots", () => {
    expect(productSlots("syrup-4oz")).toBe(1);
    expect(productSlots("jam-8oz")).toBe(2);
    expect(productSlots("butter-12oz")).toBe(3);
    expect(productSlots("unknown")).toBe(0);
    expect(productSlots(null)).toBe(0);
  });

  test("three 8oz jars fill one small box", () => {
    const qty = { strawberry: { "jam-8oz": 3 } };
    expect(packingSlots(qty)).toBe(6);
    expect(estimatedBoxes(qty)).toBe(1);
  });

  test("four 8oz jars need two boxes", () => {
    const qty = { strawberry: { "jam-8oz": 4 } };
    expect(packingSlots(qty)).toBe(8);
    expect(estimatedBoxes(qty)).toBe(2);
  });

  test("empty cart needs no boxes", () => {
    expect(estimatedBoxes({})).toBe(0);
    expect(estimatedBoxes(null)).toBe(0);
  });
});

describe("zoneFromZip", () => {
  test("returns 0 for missing or short ZIP", () => {
    expect(zoneFromZip("")).toBe(0);
    expect(zoneFromZip("123")).toBe(0);
    expect(zoneFromZip(null)).toBe(0);
    expect(normalizeZip("60601-1234")).toBe("60601");
    expect(normalizeZip("00000")).toBe("");
    expect(normalizeZip("123")).toBe("");
  });

  test("maps Knoxville-origin bands", () => {
    expect(zoneFromZip("37919")).toBe(1);
    expect(zoneFromZip("37203")).toBe(2);
    expect(zoneFromZip("30301")).toBe(3);
    expect(zoneFromZip("60601")).toBe(5);
    expect(zoneFromZip("10001")).toBe(6);
    expect(zoneFromZip("90210")).toBe(8);
  });
});

describe("shippingQuote", () => {
  const threeJams = { strawberry: { "jam-8oz": 3 } };

  test("pickup is always free with no boxes or zone", () => {
    expect(shippingQuote({ qty: threeJams, fulfillment: "pickup", zip: "60601" })).toEqual({
      cost: 0,
      boxes: 0,
      zone: 0,
    });
  });

  test("delivery of 3×8oz to a typical ZIP is $14 and one box", () => {
    expect(shippingQuote({ qty: threeJams, fulfillment: "delivery", zip: "60601" })).toEqual({
      cost: 14,
      boxes: 1,
      zone: 5,
    });
  });

  test("nearby Knoxville ZIP is $11 for one small box", () => {
    expect(
      shippingQuote({ qty: threeJams, fulfillment: "delivery", zip: "37919" })
    ).toMatchObject({ cost: 11, boxes: 1, zone: 1 });
  });

  test("far single-box quote uses the $20 rate and stays under the $25 cap", () => {
    const quote = shippingQuote({
      qty: threeJams,
      fulfillment: "delivery",
      zip: "90210",
    });
    expect(quote).toMatchObject({ cost: 20, boxes: 1, zone: 8 });
    expect(quote.cost).toBeLessThanOrEqual(25);
    expect(smallBoxRate(8)).toBe(20);
  });

  test("two boxes would be $28 at the typical rate but shipping is capped at $25", () => {
    const qty = { strawberry: { "jam-8oz": 4 } };
    expect(shippingQuote({ qty, fulfillment: "delivery", zip: "60601" })).toEqual({
      cost: 25,
      boxes: 2,
      zone: 5,
    });
  });

  test("far multi-box quotes also stay at the $25 cap", () => {
    const qty = { strawberry: { "jam-8oz": 4 } };
    expect(
      shippingQuote({ qty, fulfillment: "delivery", zip: "90210" }).cost
    ).toBe(25);
  });

  test("delivery without a valid ZIP keeps box count but no cost", () => {
    expect(shippingQuote({ qty: threeJams, fulfillment: "delivery", zip: "" })).toEqual({
      cost: 0,
      boxes: 1,
      zone: 0,
    });
  });
});

describe("phone helpers", () => {
  test("normalizePhone requires exactly 10 digits and ignores a leading 1", () => {
    expect(normalizePhone("(555) 012-3456")).toBe("5550123456");
    expect(normalizePhone("5550123456")).toBe("5550123456");
    expect(normalizePhone("555-0100")).toBe("");
    expect(normalizePhone("+1 555 012 3456")).toBe("");
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
  });

  test("formatPhone remasks leftover digits", () => {
    expect(formatPhone("5")).toBe("(5");
    expect(formatPhone("555012")).toBe("(555) 012");
    expect(formatPhone("5550123456")).toBe("(555) 012-3456");
    expect(formatPhone("555123456")).toBe("(555) 123-456");
    expect(formatPhone("")).toBe("");
  });

  test("backspacing punctuation drops the adjacent digit", () => {
    const prev = "(555) 012-3456";
    const nextRaw = "(555) 0123456";
    const caret = 9;
    expect(applyPhoneInputChange(prev, nextRaw, caret)).toEqual({
      formatted: "(555) 013-456",
      caret: expect.any(Number),
    });
    expect(applyPhoneInputChange(prev, nextRaw, caret).formatted).toBe(
      "(555) 013-456"
    );
  });

  test("forward-delete on punctuation drops the following digit", () => {
    const prev = "(555) 012-3456";
    const nextRaw = "(555) 0123456";
    const caret = 9;
    expect(
      applyPhoneInputChange(prev, nextRaw, caret, "deleteContentForward")
        .formatted
    ).toBe("(555) 012-456");
  });
});

describe("orderQuote and buildOrderNotification", () => {
  const qty = { strawberry: { "jam-8oz": 3 } };

  test("orderQuote adds shipping to the item subtotal for delivery", () => {
    const quote = orderQuote({ qty, fulfillment: "delivery", zip: "60601" });
    expect(quote.itemCount).toBe(3);
    expect(quote.itemTotal).toBe(27);
    expect(quote.shipping).toEqual({ cost: 14, boxes: 1, zone: 5 });
    expect(quote.total).toBe(41);
  });

  test("pickup orderQuote total matches item subtotal", () => {
    const quote = orderQuote({ qty, fulfillment: "pickup", zip: "60601" });
    expect(quote.shipping.cost).toBe(0);
    expect(quote.total).toBe(quote.itemTotal);
    expect(quote.total).toBe(orderTotals(qty).total);
  });

  test("notification payload includes shipping cost, boxes, and zone", () => {
    const payload = buildOrderNotification({
      qty,
      name: "Ada",
      phone: "5550123456",
      fulfillment: "delivery",
      address: "123 Orchard Lane",
      zip: "60601",
      notes: "Leave at door",
    });

    expect(payload.shipping).toEqual({
      cost: 14,
      estimatedBoxes: 1,
      zone: 5,
    });
    expect(payload.itemTotal).toBe(27);
    expect(payload.total).toBe(41);
    expect(payload.zip).toBe("60601");
    expect(payload.phone).toBe("(555) 012-3456");
    expect(payload.fulfillment).toBe("delivery");
    expect(payload.paymentMethod).toBe("");
  });

  test("notification payload includes a selected payment method", () => {
    const payload = buildOrderNotification({
      qty,
      name: "Ada",
      phone: "5550123456",
      fulfillment: "pickup",
      paymentMethod: "venmo",
    });

    expect(payload.paymentMethod).toBe("venmo");
  });

  test("notification payload ignores unknown payment methods", () => {
    const payload = buildOrderNotification({
      qty,
      name: "Ada",
      phone: "5550123456",
      paymentMethod: "bitcoin",
    });

    expect(payload.paymentMethod).toBe("");
  });

  test("notification payload drops Apple Pay on delivery", () => {
    const payload = buildOrderNotification({
      qty,
      name: "Ada",
      phone: "5550123456",
      fulfillment: "delivery",
      address: "123 Orchard Lane",
      zip: "60601",
      paymentMethod: "apple-pay",
    });

    expect(payload.paymentMethod).toBe("");
    expect(payload.fulfillment).toBe("delivery");
  });

  test("notification payload allowlists fulfillment and sanitizes free text", () => {
    const payload = buildOrderNotification({
      qty,
      name: "<b>Ada</b>",
      phone: "5550123456",
      fulfillment: "overnight",
      notes: "<img src=x onerror=alert(1)>Leave at door",
    });

    expect(payload.fulfillment).toBe("pickup");
    expect(payload.name).toBe("Ada");
    expect(payload.notes).toBe("Leave at door");
  });

  test("orderSummaryText includes shipping cost and payment without boxes or zone", () => {
    const payload = buildOrderNotification({
      qty,
      name: "Ada Lovelace",
      phone: "5550123456",
      fulfillment: "delivery",
      address: "123 Orchard Lane",
      zip: "60601",
      notes: "Leave at door",
      paymentMethod: "venmo",
    });
    const text = orderSummaryText(payload);
    expect(text).toContain("Jam order");
    expect(text).toContain("3 x Strawberry 8oz jam — $27.00");
    expect(text).toContain("Subtotal: $27.00");
    expect(text).toContain("Shipping: $14.00");
    expect(text).toContain("Total (3 items): $41.00");
    expect(text).toContain("Name: Ada Lovelace");
    expect(text).toContain("Phone: (555) 012-3456");
    expect(text).toContain("Fulfillment: Delivery");
    expect(text).toContain("Address: 123 Orchard Lane");
    expect(text).toContain("ZIP: 60601");
    expect(text).toContain("Notes: Leave at door");
    expect(text).toContain("Payment: Venmo");
    expect(text).not.toContain("estimatedBoxes");
    expect(text).not.toMatch(/zone/i);
  });

  test("orderSummaryText omits shipping lines for pickup", () => {
    const payload = buildOrderNotification({
      qty: { strawberry: { "jam-8oz": 1 } },
      name: "Ada",
      phone: "5550123456",
      fulfillment: "pickup",
    });
    const text = orderSummaryText(payload);
    expect(text).toContain("1 x Strawberry 8oz jam — $9.00");
    expect(text).toContain("Total (1 item): $9.00");
    expect(text).toContain("Fulfillment: Pickup");
    expect(text).not.toContain("Subtotal:");
    expect(text).not.toContain("Shipping:");
    expect(text).not.toContain("Payment:");
  });
});

describe("payment helpers", () => {
  test("paymentAmount formats two decimal places", () => {
    expect(paymentAmount(9)).toBe("9.00");
    expect(paymentAmount(41)).toBe("41.00");
    expect(paymentAmount(-4)).toBe("0.00");
  });

  test("venmoNote uses sanitized form notes and falls back to Jam order", () => {
    expect(venmoNote("")).toBe("Jam order");
    expect(venmoNote("   ")).toBe("Jam order");
    expect(venmoNote("Leave at door & ring")).toBe("Leave at door & ring");
    expect(venmoNote("<b>Leave at door</b>")).toBe("Leave at door");
    expect(venmoNote("Leave\nat\tdoor")).toBe("Leave at door");
  });

  test("Venmo payment links include the total and encoded notes", () => {
    const url = paymentLink("venmo", 9, "Leave at door & ring");
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.hostname).toBe("venmo.com");
    expect(parsed.pathname).toBe("/Tychelle-Eberle");
    expect(parsed.searchParams.get("txn")).toBe("pay");
    expect(parsed.searchParams.get("amount")).toBe("9.00");
    expect(parsed.searchParams.get("note")).toBe("Leave at door & ring");
  });

  test("Venmo payment links fall back to Jam order when notes are blank", () => {
    const url = paymentLink("venmo", 18, "   ");
    expect(new URL(url).searchParams.get("note")).toBe("Jam order");
  });

  test("Cash App payment links include the cashtag and total", () => {
    const url = paymentLink("cash-app", 9, "ignored");
    expect(url).toMatch(/^https:\/\/cash\.app\//);
    expect(url).toContain("Jamerelle");
    expect(url).toContain("9.00");
  });

  test("Apple Pay has no payment link", () => {
    expect(paymentLink("apple-pay", 9, "Jam order")).toBe("");
  });

  test("markup in notes cannot change the payment origin", () => {
    const url = paymentLink("venmo", 9, "https://evil.example/</script>");
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("venmo.com");
    expect(parsed.pathname).toBe("/Tychelle-Eberle");
  });

  test("Apple Pay is allowed for pickup and blocked for delivery", () => {
    expect(isPaymentMethodAllowed("apple-pay", "pickup")).toBe(true);
    expect(isPaymentMethodAllowed("apple-pay", "delivery")).toBe(false);
    expect(isPaymentMethodAllowed("venmo", "delivery")).toBe(true);
    expect(normalizePaymentMethod("apple-pay", "delivery")).toBe("");
    expect(normalizePaymentMethod("apple-pay", "pickup")).toBe("apple-pay");
    expect(paymentSubmitError("apple-pay", "delivery")).toBe(
      "Apple Pay is only available for pickup orders."
    );
    expect(paymentSubmitError("venmo", "delivery")).toBe("");
    expect(paymentSubmitError("", "delivery")).toBe("");
  });

  test("sanitizeOrderText strips HTML and caps length", () => {
    expect(sanitizeOrderText("<img src=x onerror=alert(1)>Hello", 80)).toBe(
      "Hello"
    );
    expect(sanitizeOrderText("a".repeat(NAME_MAX_LENGTH + 10), NAME_MAX_LENGTH)).toHaveLength(
      NAME_MAX_LENGTH
    );
    expect(sanitizeOrderText(null, ADDRESS_MAX_LENGTH)).toBe("");
    expect(sanitizeOrderText("ok", NOTES_MAX_LENGTH)).toBe("ok");
  });

  test("serializeOrderPayload escapes script breakouts and stays JSON", () => {
    const serialized = serializeOrderPayload({ notes: "</script>" });
    expect(serialized).not.toMatch(/<\/script/i);
    expect(JSON.parse(serialized)).toEqual({ notes: "</script>" });
  });
});
