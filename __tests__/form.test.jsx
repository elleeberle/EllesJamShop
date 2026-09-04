import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JamOrderForm from "../form.jsx";
import { FLAVORS, currency } from "../order.js";

function renderForm() {
  return render(<JamOrderForm />);
}

function increaseButton(flavor, product) {
  return screen.getByRole("button", {
    name: `Increase ${flavor.name} ${product.name}`,
  });
}

function decreaseButton(flavor, product) {
  return screen.getByRole("button", {
    name: `Decrease ${flavor.name} ${product.name}`,
  });
}

function expectSaneAmounts(container) {
  const text = container.textContent;
  expect(text).not.toMatch(/\bnull\b/i);
  expect(text).not.toMatch(/\bundefined\b/i);
  expect(text).not.toMatch(/NaN/i);
  expect(text).not.toMatch(/-\$/);
  expect(text).not.toMatch(/\$-/);
}

test("renders the order form", () => {
  renderForm();

  expect(
    screen.getByRole("heading", { name: "Elle's Homemade Jams" })
  ).toBeInTheDocument();
  const pickupDeadline = screen.getByText(
    "Pickup orders close Thursday at 8:00 p.m."
  );
  expect(pickupDeadline.tagName).toBe("STRONG");
  expect(pickupDeadline).toHaveStyle({ fontStyle: "italic" });
  expect(screen.getByText("Strawberry")).toBeInTheDocument();
  expect(screen.getByText("Blueberry")).toBeInTheDocument();
  expect(screen.getByTestId("order-item-count")).toHaveTextContent("0 items");
  expect(screen.getByRole("button", { name: "Review order" })).toBeInTheDocument();
});

test("matches the initial form snapshot", () => {
  const { container } = renderForm();
  expect(container).toMatchSnapshot();
});

test("increments a flavor and updates the item count and total", async () => {
  const user = userEvent.setup();
  renderForm();
  const strawberry = FLAVORS[0];

  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.click(increaseButton(strawberry, strawberry.products[0]));

  expect(screen.getByTestId("order-item-count")).toHaveTextContent("2 items");
  expect(screen.getByTestId("order-total")).toHaveTextContent("$18.00");
  expect(screen.getByTestId("flavor-strawberry-subtotal")).toHaveTextContent(
    "$18.00"
  );
});

test("shows an error when reviewing an empty order", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.click(screen.getByRole("button", { name: "Review order" }));

  expect(
    screen.getByText("Add at least one item to your order.")
  ).toBeInTheDocument();
});

test("reviews a complete pickup order and matches the summary snapshot", async () => {
  const user = userEvent.setup();
  const { container } = renderForm();
  const strawberry = FLAVORS[0];

  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.type(screen.getByPlaceholderText("Jane Doe"), "Ada Lovelace");
  await user.type(screen.getByPlaceholderText("(555) 012-3456"), "555-0100");
  await user.click(screen.getByRole("button", { name: "Review order" }));

  expect(screen.getByText("Order summary")).toBeInTheDocument();
  expect(screen.getByText(/1 × Strawberry 8oz jam/)).toBeInTheDocument();
  expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Text this order" })).toBeInTheDocument();
  expect(container).toMatchSnapshot();
});

describe("flavor subsection dollar amounts", () => {
  test.each(FLAVORS)(
    "updates the $name subtotal for each product line",
    (flavor) => {
      const { container } = renderForm();
      const section = screen.getByTestId(`flavor-${flavor.id}`);
      let expectedSubtotal = 0;

      expect(within(section).getByTestId(`flavor-${flavor.id}-subtotal`)).toHaveTextContent(
        "$0.00"
      );

      flavor.products.forEach((product) => {
        fireEvent.click(increaseButton(flavor, product));
        expectedSubtotal += product.price;

        expect(screen.getByTestId(`qty-${flavor.id}-${product.id}`)).toHaveTextContent(
          "1"
        );
        expect(
          screen.getByTestId(`line-${flavor.id}-${product.id}-amount`)
        ).toHaveTextContent(
          `${currency(product.price)} each · ${currency(product.price)}`
        );
        expect(
          within(section).getByTestId(`flavor-${flavor.id}-subtotal`)
        ).toHaveTextContent(currency(expectedSubtotal));
      });

      expect(screen.getByTestId("order-item-count")).toHaveTextContent(
        `${flavor.products.length} item${flavor.products.length === 1 ? "" : "s"}`
      );
      expect(screen.getByTestId("order-total")).toHaveTextContent(
        currency(expectedSubtotal)
      );
      expectSaneAmounts(container);
    }
  );

  test("keeps other flavor subtotals at $0.00 when one subsection changes", () => {
    renderForm();
    const strawberry = FLAVORS[0];
    fireEvent.click(increaseButton(strawberry, strawberry.products[0]));

    FLAVORS.slice(1).forEach((flavor) => {
      expect(screen.getByTestId(`flavor-${flavor.id}-subtotal`)).toHaveTextContent(
        "$0.00"
      );
    });
    expect(screen.getByTestId("flavor-strawberry-subtotal")).toHaveTextContent(
      "$9.00"
    );
  });
});

describe("rapid clicks stay in sync", () => {
  test("fast increments keep count, line amount, subsection subtotal, and order total aligned", () => {
    const { container } = renderForm();
    const flavor = FLAVORS[0];
    const product = flavor.products[0];
    const clicks = 8;

    for (let i = 0; i < clicks; i += 1) {
      fireEvent.click(increaseButton(flavor, product));
    }

    const expected = clicks * product.price;
    expect(screen.getByTestId(`qty-${flavor.id}-${product.id}`)).toHaveTextContent(
      String(clicks)
    );
    expect(
      screen.getByTestId(`line-${flavor.id}-${product.id}-amount`)
    ).toHaveTextContent(`${currency(product.price)} each · ${currency(expected)}`);
    expect(screen.getByTestId(`flavor-${flavor.id}-subtotal`)).toHaveTextContent(
      currency(expected)
    );
    expect(screen.getByTestId("order-item-count")).toHaveTextContent(
      `${clicks} items`
    );
    expect(screen.getByTestId("order-total")).toHaveTextContent(currency(expected));
    expectSaneAmounts(container);
  });

  test("fast mixed + and - clicks never go negative and stay consistent", () => {
    const { container } = renderForm();
    const flavor = FLAVORS.find((f) => f.id === "apple-butter");
    const product = flavor.products[1]; // 12oz butter, $12

    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(increaseButton(flavor, product));
    }
    for (let i = 0; i < 20; i += 1) {
      fireEvent.click(decreaseButton(flavor, product));
    }

    expect(screen.getByTestId(`qty-${flavor.id}-${product.id}`)).toHaveTextContent(
      "0"
    );
    expect(decreaseButton(flavor, product)).toBeDisabled();
    expect(screen.getByTestId(`flavor-${flavor.id}-subtotal`)).toHaveTextContent(
      "$0.00"
    );
    expect(screen.getByTestId("order-item-count")).toHaveTextContent("0 items");
    expect(screen.getByTestId("order-total")).toHaveTextContent("$0.00");
    expectSaneAmounts(container);
  });
});
