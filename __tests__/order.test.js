import {
  FLAVORS,
  applyQtyChange,
  clampNonNegative,
  currency,
  flavorSubtotal,
  getQty,
  orderLines,
  orderTotals,
  safeNumber,
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
