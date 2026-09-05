import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JamOrderForm from "../form.jsx";
import { FLAVORS, PAYMENT_METHODS, currency } from "../order.js";
import { patchOrder, resetOrderStore } from "../orderStore.js";
import { setZipIndexForTests } from "../zipIndex.js";
import { TEST_ZIPS } from "./testZips.js";

const mockSubmitFormspree = jest.fn();
const mockResetFormspree = jest.fn();

jest.mock("react-google-recaptcha-v3", () => ({
  GoogleReCaptchaProvider: ({ children }) => children,
  useGoogleReCaptcha: () => ({
    executeRecaptcha: jest.fn().mockResolvedValue("recaptcha-token"),
  }),
}));

jest.mock("@formspree/react", () => {
  const React = require("react");
  return {
    useForm: () => {
      const [state, setState] = React.useState({
        submitting: false,
        succeeded: false,
        errors: null,
      });
      const submit = async (payload) => {
        mockSubmitFormspree(payload);
        if (global.__formspreeOutcome === "error") {
          setState({
            submitting: false,
            succeeded: false,
            errors: { form: true },
          });
          return;
        }
        setState({ submitting: false, succeeded: true, errors: null });
      };
      const reset = () => {
        mockResetFormspree();
        setState({ submitting: false, succeeded: false, errors: null });
      };
      return [state, submit, reset];
    },
    ValidationError: ({ errors }) =>
      errors ? <p>Unable to submit order.</p> : null,
  };
});

beforeEach(() => {
  resetOrderStore();
  setZipIndexForTests(TEST_ZIPS);
  mockSubmitFormspree.mockClear();
  mockResetFormspree.mockClear();
  global.__formspreeOutcome = "success";
});

const strawberry = FLAVORS.find((f) => f.id === "strawberry");

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
  const flavorOrder = FLAVORS.map((flavor) => flavor.name);
  expect(flavorOrder).toEqual([
    "Apple butter",
    "Blackberry",
    "Blueberry",
    "Grape",
    "Raspberry",
    "Strawberry",
  ]);
  const flavorSections = flavorOrder.map((name) => screen.getByText(name));
  for (let i = 1; i < flavorSections.length; i += 1) {
    expect(
      flavorSections[i - 1].compareDocumentPosition(flavorSections[i]) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  }
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
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.type(screen.getByPlaceholderText("Jane Doe"), "Ada Lovelace");
  await user.type(screen.getByPlaceholderText("(555) 012-3456"), "5550123456");
  await user.click(screen.getByRole("button", { name: "Review order" }));

  expect(screen.getByText("Order summary")).toBeInTheDocument();
  expect(screen.getByText(/1 × Strawberry 8oz jam/)).toBeInTheDocument();
  expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit order" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Text this order" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Email this order" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Copy order details" })
  ).not.toBeInTheDocument();

  const editOrder = screen.getByRole("button", { name: "Edit order" });
  expect(editOrder.querySelector("svg")).toBeInTheDocument();
  expect(editOrder).toHaveStyle({
    border: "1.5px solid #0F766E",
    background: "#FFFFFF",
  });
  expect(container).toMatchSnapshot();
});

test("requires a ZIP code before reviewing a delivery order", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.type(screen.getByPlaceholderText("Jane Doe"), "Ada Lovelace");
  await user.type(screen.getByPlaceholderText("(555) 012-3456"), "5550123456");
  await user.click(screen.getByRole("button", { name: "delivery" }));
  await user.type(screen.getByPlaceholderText("123 Orchard Lane"), "123 Orchard Lane");
  await user.click(screen.getByRole("button", { name: "Review order" }));

  expect(screen.getByText("Enter a valid 5-digit ZIP code.")).toBeInTheDocument();
});

test("ZIP field is capped at 5 characters", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.click(screen.getByRole("button", { name: "delivery" }));
  const zip = screen.getByTestId("delivery-zip");
  expect(zip).toHaveAttribute("maxLength", "5");
  expect(zip).toHaveAttribute("autocomplete", "postal-code");
  expect(zip).toHaveAttribute("inputmode", "numeric");
  await user.type(zip, "606011234");
  expect(zip).toHaveValue("60601");
});

test("phone field requests a telephone keypad", () => {
  renderForm();
  const phone = screen.getByPlaceholderText("(555) 012-3456");
  expect(phone).toHaveAttribute("type", "tel");
  expect(phone).toHaveAttribute("inputmode", "tel");
  expect(phone).toHaveAttribute("autocomplete", "tel");
});

test("requires a 10-digit phone number before reviewing", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.type(screen.getByPlaceholderText("Jane Doe"), "Ada Lovelace");
  await user.type(screen.getByPlaceholderText("(555) 012-3456"), "555-0100");
  await user.click(screen.getByRole("button", { name: "Review order" }));

  expect(screen.getByText("Enter a 10-digit phone number.")).toBeInTheDocument();
});

test("rejects a 5-digit ZIP that is not a real US ZIP", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.type(screen.getByPlaceholderText("Jane Doe"), "Ada Lovelace");
  await user.type(screen.getByPlaceholderText("(555) 012-3456"), "5550123456");
  await user.click(screen.getByRole("button", { name: "delivery" }));
  await user.type(screen.getByPlaceholderText("123 Orchard Lane"), "123 Orchard Lane");
  await user.type(screen.getByTestId("delivery-zip"), "00000");

  expect(screen.queryByTestId("order-shipping")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Review order" }));
  expect(screen.getByText("Enter a valid 5-digit ZIP code.")).toBeInTheDocument();
});

test("backspace on the phone hyphen removes a digit and keeps masking", async () => {
  const user = userEvent.setup();
  renderForm();
  const input = screen.getByPlaceholderText("(555) 012-3456");
  await user.type(input, "5550123456");
  expect(input).toHaveValue("(555) 012-3456");

  input.focus();
  input.setSelectionRange(10, 10);
  await user.keyboard("{Backspace}");

  expect(input).toHaveValue("(555) 013-456");
});

test("delete on the phone hyphen removes the following digit and keeps masking", async () => {
  const user = userEvent.setup();
  renderForm();
  const input = screen.getByPlaceholderText("(555) 012-3456");
  await user.type(input, "5550123456");
  expect(input).toHaveValue("(555) 012-3456");

  input.focus();
  input.setSelectionRange(9, 9);
  await user.keyboard("{Delete}");

  expect(input).toHaveValue("(555) 012-456");
});

test("deleting a middle phone digit remasks without dumping the caret at the end", async () => {
  const user = userEvent.setup();
  renderForm();
  const input = screen.getByPlaceholderText("(555) 012-3456");
  await user.type(input, "5550123456");
  expect(input).toHaveValue("(555) 012-3456");

  input.focus();
  input.setSelectionRange(7, 7);
  await user.keyboard("{Backspace}");

  expect(input).toHaveValue("(555) 123-456");
  expect(input.selectionStart).toBeLessThan(input.value.length);
});

test("shows shipping after a delivery ZIP and hides boxes and zone", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.click(screen.getByRole("button", { name: "delivery" }));
  await user.type(screen.getByTestId("delivery-zip"), "60601");

  expect(screen.getByTestId("order-item-count")).toHaveTextContent("3 items");
  expect(screen.getByTestId("order-subtotal")).toHaveTextContent("$27.00");
  expect(screen.getByTestId("order-shipping")).toHaveTextContent("$14.00");
  expect(screen.getByTestId("order-total")).toHaveTextContent("$41.00");
  expect(screen.queryByText(/zone/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/box/i)).not.toBeInTheDocument();
});

test("pickup does not show a shipping line", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.click(increaseButton(strawberry, strawberry.products[0]));

  expect(screen.queryByTestId("order-shipping")).not.toBeInTheDocument();
  expect(screen.getByTestId("order-total")).toHaveTextContent("$9.00");
});

test("reviews a delivery order with hidden notification metadata", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.type(screen.getByPlaceholderText("Jane Doe"), "Ada Lovelace");
  await user.type(screen.getByPlaceholderText("(555) 012-3456"), "5550123456");
  await user.click(screen.getByRole("button", { name: "delivery" }));
  await user.type(screen.getByPlaceholderText("123 Orchard Lane"), "123 Orchard Lane");
  await user.type(screen.getByTestId("delivery-zip"), "60601");
  await user.click(screen.getByRole("button", { name: "Review order" }));

  expect(screen.getByText("Order summary")).toBeInTheDocument();
  expect(screen.getByTestId("summary-shipping")).toHaveTextContent("$14.00");
  expect(screen.getByTestId("summary-total")).toHaveTextContent("$41.00");

  const summaryCard = screen.getByTestId("order-summary-card");
  expect(summaryCard.textContent).not.toMatch(/estimatedBoxes/);
  expect(summaryCard.textContent).not.toMatch(/\bzone\b/i);

  const payloadNode = screen.getByTestId("order-notification-payload");
  expect(payloadNode).not.toBeVisible();
  const payload = JSON.parse(payloadNode.textContent);
  expect(payload.shipping).toEqual({
    cost: 14,
    estimatedBoxes: 1,
    zone: 5,
  });

  await user.click(screen.getByRole("button", { name: "Submit order" }));
  expect(mockSubmitFormspree).toHaveBeenCalled();
  const submitted = mockSubmitFormspree.mock.calls[0][0];
  expect(submitted.message).toContain("Shipping: $14.00");
  expect(submitted.message).not.toContain("estimatedBoxes");
  expect(submitted.message).not.toMatch(/zone/i);
  expect(submitted.shippingCost).toBe(14);
});

const paymentMethodNames = PAYMENT_METHODS.map((method) => method.label);

async function reviewPickupOrder(user, extra = {}) {
  await user.click(increaseButton(strawberry, strawberry.products[0]));
  await user.type(screen.getByPlaceholderText("Jane Doe"), extra.name ?? "Ada Lovelace");
  await user.type(screen.getByPlaceholderText("(555) 012-3456"), "5550123456");
  if (extra.notes) {
    await user.type(
      screen.getByPlaceholderText("Allergies, gift note, preferred pickup time..."),
      extra.notes
    );
  }
  await user.click(screen.getByRole("button", { name: "Review order" }));
}

async function switchToDeliveryReview(user) {
  await user.click(screen.getByRole("button", { name: "Edit order" }));
  await user.click(screen.getByRole("button", { name: "delivery" }));
  await user.type(screen.getByPlaceholderText("123 Orchard Lane"), "123 Orchard Lane");
  await user.type(screen.getByTestId("delivery-zip"), "37919");
  await user.click(screen.getByRole("button", { name: "Review order" }));
}

test("review enables Apple Pay for pickup and disables it for delivery", async () => {
  const user = userEvent.setup();
  renderForm();
  await reviewPickupOrder(user);

  const pickupAccordion = screen.getByTestId("payment-accordion");
  expect(within(pickupAccordion).getByText("Payment")).toBeInTheDocument();
  paymentMethodNames.forEach((label) => {
    expect(within(pickupAccordion).getByRole("radio", { name: label })).toBeEnabled();
  });
  expect(
    within(pickupAccordion)
      .getAllByRole("radio")
      .map((radio) => radio.getAttribute("value"))
  ).toEqual(["apple-pay", "cash-app", "venmo"]);

  await user.click(screen.getByRole("button", { name: "Edit order" }));
  await user.click(screen.getByRole("button", { name: "delivery" }));
  await user.type(screen.getByPlaceholderText("123 Orchard Lane"), "123 Orchard Lane");
  await user.type(screen.getByTestId("delivery-zip"), "37919");
  await user.click(screen.getByRole("button", { name: "Review order" }));

  const deliveryAccordion = screen.getByTestId("payment-accordion");
  expect(within(deliveryAccordion).getByRole("radio", { name: "Venmo" })).toBeEnabled();
  expect(within(deliveryAccordion).getByRole("radio", { name: "Cash App" })).toBeEnabled();
  expect(within(deliveryAccordion).getByRole("radio", { name: "Apple Pay" })).toBeDisabled();
  expect(within(deliveryAccordion).getByText("Pickup only")).toBeInTheDocument();
});

test("selecting Venmo shows a handle, QR code, and amount", async () => {
  const user = userEvent.setup();
  renderForm();
  await reviewPickupOrder(user);

  await user.click(screen.getByRole("radio", { name: "Venmo" }));

  expect(screen.getByText("Payment · Venmo")).toBeInTheDocument();
  const handle = screen.getByTestId("payment-handle-venmo");
  expect(handle).toHaveTextContent("@Tychelle-Eberle");
  expect(handle.getAttribute("href")).toContain("venmo.com");
  expect(screen.getByTestId("payment-qr-venmo").querySelector("svg")).toBeTruthy();
  expect(screen.getByText("Scan to pay $9.00")).toBeInTheDocument();
});

test("selecting Cash App shows a handle and QR code", async () => {
  const user = userEvent.setup();
  renderForm();
  await reviewPickupOrder(user);

  await user.click(screen.getByRole("radio", { name: "Cash App" }));

  const handle = screen.getByTestId("payment-handle-cash-app");
  expect(handle).toHaveTextContent("$Jamerelle");
  expect(handle.getAttribute("href")).toContain("cash.app");
  expect(screen.getByTestId("payment-qr-cash-app").querySelector("svg")).toBeTruthy();
});

test("selecting Apple Pay on pickup shows an in-person note and no QR", async () => {
  const user = userEvent.setup();
  renderForm();
  await reviewPickupOrder(user);

  await user.click(screen.getByRole("radio", { name: "Apple Pay" }));

  expect(screen.getByText("Payment · Apple Pay")).toBeInTheDocument();
  expect(screen.getByTestId("apple-pay-note")).toHaveTextContent(
    "Apple Pay (in-person only)"
  );
  expect(screen.queryByTestId("payment-qr-apple-pay")).not.toBeInTheDocument();
});

test("switching to delivery clears a selected Apple Pay method", async () => {
  const user = userEvent.setup();
  renderForm();
  await reviewPickupOrder(user);
  await user.click(screen.getByRole("radio", { name: "Apple Pay" }));
  expect(screen.getByText("Payment · Apple Pay")).toBeInTheDocument();

  await switchToDeliveryReview(user);

  expect(screen.getByText("Payment")).toBeInTheDocument();
  expect(screen.queryByText("Payment · Apple Pay")).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Apple Pay" })).not.toBeChecked();
});

test("delivery submit rejects Apple Pay even if it is forced on", async () => {
  const user = userEvent.setup();
  renderForm();
  await reviewPickupOrder(user);
  await switchToDeliveryReview(user);
  await act(async () => {
    patchOrder({ paymentMethod: "apple-pay" });
  });

  await user.click(screen.getByRole("button", { name: "Submit order" }));
  expect(mockSubmitFormspree).not.toHaveBeenCalled();
  expect(
    screen.getByText("Apple Pay is only available for pickup orders.")
  ).toBeInTheDocument();
});

test("hostile notes are sanitized on the review card and payload", async () => {
  const user = userEvent.setup();
  renderForm();
  await reviewPickupOrder(user, {
    notes: "<img src=x onerror=alert(1)>Leave at door",
  });

  expect(screen.getByText("Note: Leave at door")).toBeInTheDocument();
  expect(screen.queryByText(/onerror/i)).not.toBeInTheDocument();

  const payloadNode = screen.getByTestId("order-notification-payload");
  expect(payloadNode.innerHTML).not.toMatch(/<\/script/i);
  const payload = JSON.parse(payloadNode.textContent);
  expect(payload.notes).toBe("Leave at door");
});

test("selecting a payment method updates the accordion and order text", async () => {
  const user = userEvent.setup();
  renderForm();
  await reviewPickupOrder(user);

  await user.click(screen.getByRole("radio", { name: "Venmo" }));

  expect(screen.getByText("Payment · Venmo")).toBeInTheDocument();
  const payload = JSON.parse(screen.getByTestId("order-notification-payload").textContent);
  expect(payload.paymentMethod).toBe("venmo");
  await user.click(screen.getByRole("button", { name: "Submit order" }));
  expect(mockSubmitFormspree.mock.calls[0][0].message).toContain("Payment: Venmo");
  expect(mockSubmitFormspree.mock.calls[0][0].paymentMethod).toBe("venmo");
});

test("successful submit shows confirmation and print invoice", async () => {
  const user = userEvent.setup();
  renderForm();
  await reviewPickupOrder(user);

  await user.click(screen.getByRole("button", { name: "Submit order" }));

  expect(await screen.findByTestId("order-sent-note")).toHaveTextContent(
    "Order sent"
  );
  expect(screen.getByRole("button", { name: "Print invoice" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit order" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Submit order" })).not.toBeInTheDocument();

  const print = jest.fn();
  const originalPrint = window.print;
  window.print = print;
  try {
    await user.click(screen.getByRole("button", { name: "Print invoice" }));
    expect(print).toHaveBeenCalled();
  } finally {
    window.print = originalPrint;
  }
});

test("Formspree errors stay on the summary", async () => {
  const user = userEvent.setup();
  global.__formspreeOutcome = "error";
  renderForm();
  await reviewPickupOrder(user);

  await user.click(screen.getByRole("button", { name: "Submit order" }));

  expect(await screen.findByText("Unable to submit order.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit order" })).toBeInTheDocument();
  expect(screen.queryByTestId("order-sent-note")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit order" })).toBeInTheDocument();
});

test("start a new order resets Formspree and the form", async () => {
  const user = userEvent.setup();
  renderForm();
  await reviewPickupOrder(user);
  await user.click(screen.getByRole("button", { name: "Submit order" }));
  expect(await screen.findByTestId("order-sent-note")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Start a new order" }));

  expect(mockResetFormspree).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Review order" })).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Jane Doe")).toHaveValue("");
});

test("edit order returns to the form without clearing fields", async () => {
  const user = userEvent.setup();
  renderForm();
  await reviewPickupOrder(user);

  await user.click(screen.getByRole("radio", { name: "Cash App" }));
  await user.click(screen.getByRole("button", { name: "Edit order" }));

  expect(screen.getByRole("button", { name: "Review order" })).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Jane Doe")).toHaveValue("Ada Lovelace");
  expect(screen.getByPlaceholderText("(555) 012-3456")).toHaveValue(
    "(555) 012-3456"
  );
  expect(screen.getByTestId("qty-strawberry-jam-8oz")).toHaveTextContent("1");

  await user.click(screen.getByRole("button", { name: "Review order" }));
  expect(screen.getByText("Payment · Cash App")).toBeInTheDocument();
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
    fireEvent.click(increaseButton(strawberry, strawberry.products[0]));

    FLAVORS.filter((flavor) => flavor.id !== strawberry.id).forEach((flavor) => {
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
