import {
  FLAVORS,
  applyQtyChange,
  buildOrderNotification,
  clampNonNegative,
  currency,
  estimatedBoxes,
  flavorSubtotal,
  getQty,
  normalizeZip,
  orderLines,
  orderQuote,
  orderTotals,
  packingSlots,
  productSlots,
  safeNumber,
  shippingQuote,
  smallBoxRate,
  zoneFromZip,
} from "../order.js";

const strawberry = FLAVORS.find((f) => f.id === "strawberry");
const appleButter = FLAVORS.find((f) => f.id === "apple-butter");

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
      phone: "555-0100",
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
    expect(payload.fulfillment).toBe("delivery");
    expect(payload.paymentMethod).toBe("");
  });

  test("notification payload includes a selected payment method", () => {
    const payload = buildOrderNotification({
      qty,
      name: "Ada",
      phone: "555-0100",
      fulfillment: "pickup",
      paymentMethod: "venmo",
    });

    expect(payload.paymentMethod).toBe("venmo");
  });

  test("notification payload ignores unknown payment methods", () => {
    const payload = buildOrderNotification({
      qty,
      name: "Ada",
      phone: "555-0100",
      paymentMethod: "bitcoin",
    });

    expect(payload.paymentMethod).toBe("");
  });
});
