import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { useStore } from "@tanstack/react-store";
import { useForm, ValidationError } from "@formspree/react";
import { QRCodeSVG } from "qrcode.react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import {
  ADDRESS_MAX_LENGTH,
  FLAVORS,
  NAME_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  PAYMENT_METHODS,
  applyPhoneInputChange,
  buildOrderNotification,
  currency,
  flavorSubtotal,
  formatPhone,
  getQty,
  isPaymentMethodAllowed,
  normalizePhone,
  normalizeZip,
  orderQuote,
  orderSummaryText,
  paymentLink,
  paymentMethodLabel,
  paymentSubmitError,
  sanitizeOrderText,
  serializeOrderPayload,
} from "./order.js";
import {
  changeOrderQty,
  orderStore,
  patchOrder,
  resetOrderStore,
} from "./orderStore.js";
import { FORMSPREE_FORM_ID } from "./formspree.js";
import { ensureZipIndex } from "./zipCache.js";

export default function JamOrderForm() {
  const {
    qty,
    name,
    phone,
    fulfillment,
    address,
    zip,
    notes,
    step,
    paymentMethod,
  } = useStore(orderStore);
  const [error, setError] = useState("");
  const phoneInputRef = useRef(null);
  const phoneCaretRef = useRef(null);
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [formspree, submitFormspree, resetFormspree] = useForm(
    FORMSPREE_FORM_ID,
    { data: { "g-recaptcha-response": executeRecaptcha } }
  );
  const submitted = step === "submitted" || formspree.succeeded;

  useEffect(() => {
    ensureZipIndex();
  }, []);

  useEffect(() => {
    if (formspree.succeeded && step !== "submitted") {
      patchOrder({ step: "submitted" });
    }
  }, [formspree.succeeded, step]);

  useLayoutEffect(() => {
    const input = phoneInputRef.current;
    const caret = phoneCaretRef.current;
    if (input && caret != null) {
      input.setSelectionRange(caret, caret);
      phoneCaretRef.current = null;
    }
  }, [phone]);

  const quote = useMemo(
    () => orderQuote({ qty, fulfillment, zip }),
    [qty, fulfillment, zip]
  );
  const { lines, itemCount, itemTotal, shipping, total } = quote;
  const showShipping = fulfillment === "delivery" && shipping.zone > 0;
  const safeName = sanitizeOrderText(name, NAME_MAX_LENGTH);
  const safeAddress = sanitizeOrderText(address, ADDRESS_MAX_LENGTH);
  const safeNotes = sanitizeOrderText(notes, NOTES_MAX_LENGTH);
  const notification = useMemo(
    () =>
      buildOrderNotification({
        qty,
        name,
        phone,
        fulfillment,
        address,
        zip,
        notes,
        paymentMethod,
      }),
    [qty, name, phone, fulfillment, address, zip, notes, paymentMethod]
  );

  function changeQty(flavorId, productId, delta) {
    changeOrderQty(flavorId, productId, delta);
  }

  function handleReview() {
    if (itemCount === 0) {
      setError("Add at least one item to your order.");
      return;
    }
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!normalizePhone(phone)) {
      setError("Enter a 10-digit phone number.");
      return;
    }
    if (fulfillment === "delivery" && !address.trim()) {
      setError("Enter a delivery address.");
      return;
    }
    if (fulfillment === "delivery" && !normalizeZip(zip)) {
      setError("Enter a valid 5-digit ZIP code.");
      return;
    }
    setError("");
    patchOrder({ step: "summary" });
  }

  function handlePhoneChange(e) {
    const caret = e.target.selectionStart ?? e.target.value.length;
    const { formatted, caret: nextCaret } = applyPhoneInputChange(
      phone,
      e.target.value,
      caret,
      e.nativeEvent.inputType
    );
    phoneCaretRef.current = nextCaret;
    patchOrder({ phone: formatted });
  }

  function handleEditOrder() {
    setError("");
    patchOrder({ step: "form" });
  }

  function guardOutbound() {
    const message = paymentSubmitError(paymentMethod, fulfillment);
    if (message) {
      setError(message);
      return true;
    }
    setError("");
    return false;
  }

  function handleOrderSubmit(e) {
    e.preventDefault();
    if (guardOutbound()) return;
    const gotcha = e.target.elements._gotcha?.value ?? "";
    return submitFormspree({
      _subject: `Jam order from ${notification.name}`,
      message: orderSummaryText(notification),
      name: notification.name,
      phone: notification.phone,
      fulfillment: notification.fulfillment,
      address: notification.address,
      zip: notification.zip,
      notes: notification.notes,
      paymentMethod: notification.paymentMethod,
      itemCount: notification.itemCount,
      itemTotal: notification.itemTotal,
      shippingCost: notification.shipping.cost,
      total: notification.total,
      lines: notification.lines
        .map((line) => `${line.n} x ${line.label} — ${currency(line.amount)}`)
        .join("\n"),
      _gotcha: gotcha,
    });
  }

  function handlePrint() {
    window.print();
  }

  function handleReset() {
    resetFormspree();
    resetOrderStore();
    setError("");
  }

  return (
    <div
      style={{
        fontFamily:
          "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
        background: "#F0FBF9",
        minHeight: "100vh",
        color: "#16302C",
      }}
    >
      <style>
        {`@media print {
          .no-print { display: none !important; }
          body { background: #fff; }
        }`}
      </style>
      <div style={{ maxWidth: 440, margin: "0 auto", paddingBottom: 120 }}>
        {/* Header */}
        <div
          className="no-print"
          style={{
            background: "#0F766E",
            padding: "28px 24px 32px",
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <JarIcon />
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 26,
                  fontWeight: 700,
                  color: "#F0FBF9",
                  letterSpacing: 0.2,
                }}
              >
                Elle's Homemade Jams
              </h1>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 14,
                  color: "#CFF0EA",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                Small-batch, from our kitchen to yours
              </p>
            </div>
          </div>
          <p
            style={{
              margin: "14px 0 0",
              fontSize: 13,
              lineHeight: 1.45,
              color: "#CFF0EA",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            All products are made with organic fruit, sugar, 100% lemon juice,
            and pectin
          </p>
        </div>

        {step === "form" ? (
          <>
          <div
            style={{
              margin: "20px 20px 0",
              padding: "16px 18px",
              background: "#D4EDE8",
              border: "1.5px solid #0F766E",
              borderRadius: 16,
              color: "#16302C",
              fontSize: 14,
              lineHeight: 1.5,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            <strong style={{ fontStyle: "italic" }}>
              Pickup orders close Thursday at 8:00 p.m.
            </strong>{" "}
            Unless otherwise arranged, pickups take place in Knoxville on
            Saturdays.
          </div>
          <div style={{ padding: "24px 20px 0" }}>
            {/* Flavors */}
            <SectionLabel>Pick your flavors</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {FLAVORS.map((f) => (
                <FlavorSection
                  key={f.id}
                  flavor={f}
                  qty={qty}
                  onChangeQty={changeQty}
                />
              ))}
            </div>

            {/* Customer info */}
            <SectionLabel style={{ marginTop: 28 }}>Your details</SectionLabel>
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #BFE3DD",
                borderRadius: 16,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <Field label="Name">
                <input
                  style={inputStyle}
                  value={name}
                  onChange={(e) => patchOrder({ name: e.target.value })}
                  placeholder="Jane Doe"
                />
              </Field>
              <Field label="Phone">
                <input
                  ref={phoneInputRef}
                  style={inputStyle}
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="(555) 012-3456"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  name="tel"
                />
              </Field>

              <Field label="Fulfillment">
                <div style={{ display: "flex", gap: 10 }}>
                  {["pickup", "delivery"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        patchOrder({
                          fulfillment: opt,
                          ...(opt === "pickup" ? { zip: "" } : {}),
                          ...(opt === "delivery" && paymentMethod === "apple-pay"
                            ? { paymentMethod: "" }
                            : {}),
                        });
                      }}
                      style={{
                        flex: 1,
                        padding: "10px 0",
                        borderRadius: 10,
                        border:
                          fulfillment === opt
                            ? "1.5px solid #0F766E"
                            : "1px solid #BFE3DD",
                        background: fulfillment === opt ? "#FDE68A" : "#FFFFFF",
                        color: fulfillment === opt ? "#0F766E" : "#3F6560",
                        fontWeight: 600,
                        fontFamily: "system-ui, -apple-system, sans-serif",
                        fontSize: 14,
                        textTransform: "capitalize",
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </Field>

              {fulfillment === "delivery" && (
                <>
                <Field label="Delivery address">
                  <input
                    style={inputStyle}
                    value={address}
                    onChange={(e) => patchOrder({ address: e.target.value })}
                    placeholder="123 Orchard Lane"
                  />
                </Field>
                <Field label="ZIP code">
                  <input
                    style={inputStyle}
                    value={zip}
                    onChange={(e) =>
                      patchOrder({
                        zip: e.target.value.replace(/\D/g, "").slice(0, 5),
                      })
                    }
                    placeholder="37919"
                    type="text"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    name="postal-code"
                    maxLength={5}
                    data-testid="delivery-zip"
                  />
                </Field>
                </>
              )}

              <Field label="Notes (optional)">
                <textarea
                  style={{ ...inputStyle, height: 64, resize: "none" }}
                  value={notes}
                  onChange={(e) => patchOrder({ notes: e.target.value })}
                  placeholder="Allergies, gift note, preferred pickup time..."
                />
              </Field>
            </div>

            {error && (
              <p
                style={{
                  color: "#B45309",
                  fontSize: 14,
                  marginTop: 12,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                {error}
              </p>
            )}
          </div>
          </>
        ) : (
          <div style={{ padding: "24px 20px 0" }}>
            {!submitted && (
            <button
              type="button"
              onClick={handleEditOrder}
              data-testid="edit-order"
              className="no-print"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                padding: "8px 14px",
                borderRadius: 10,
                border: "1.5px solid #0F766E",
                background: "#FFFFFF",
                color: "#0F766E",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "system-ui, -apple-system, sans-serif",
                cursor: "pointer",
              }}
            >
              <EditIcon />
              Edit order
            </button>
            )}
            {submitted && (
              <p
                data-testid="order-sent-note"
                style={{
                  margin: "0 0 12px",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#0F766E",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                Order sent
              </p>
            )}
            <SectionLabel>Order summary</SectionLabel>
            <div
              data-testid="order-summary-card"
              style={{
                background: "#FFFFFF",
                border: "1px solid #BFE3DD",
                borderRadius: 16,
                padding: 18,
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              {lines.map((line) => (
                <div
                  key={line.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    fontSize: 15,
                  }}
                >
                  <span>
                    {line.n} &times; {line.label}
                  </span>
                  <span>{currency(line.amount)}</span>
                </div>
              ))}
              {showShipping && (
                <>
                  <div
                    style={{
                      borderTop: "1px solid #E6F7F4",
                      marginTop: 8,
                      paddingTop: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 15,
                    }}
                  >
                    <span>Subtotal</span>
                    <span data-testid="summary-subtotal">{currency(itemTotal)}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      fontSize: 15,
                    }}
                  >
                    <span>Shipping</span>
                    <span data-testid="summary-shipping">{currency(shipping.cost)}</span>
                  </div>
                </>
              )}
              <div
                style={{
                  borderTop: "1px solid #E6F7F4",
                  marginTop: 8,
                  paddingTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                <span>Total</span>
                <span data-testid="summary-total">{currency(total)}</span>
              </div>
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: "1px solid #E6F7F4",
                  fontSize: 14,
                  color: "#3F6560",
                  lineHeight: 1.6,
                }}
              >
                <div>{safeName}</div>
                <div>{formatPhone(phone) || phone}</div>
                <div>
                  {fulfillment === "pickup"
                    ? "Pickup"
                    : `Delivery — ${safeAddress}${
                        normalizeZip(zip) ? ` ${normalizeZip(zip)}` : ""
                      }`}
                </div>
                {safeNotes && <div>Note: {safeNotes}</div>}
              </div>
            </div>

            <div className="no-print">
            <PaymentAccordion
              paymentMethod={paymentMethod}
              fulfillment={fulfillment}
              total={total}
              notes={notes}
              onSelect={(id) => {
                if (!isPaymentMethodAllowed(id, fulfillment)) return;
                if (submitted) return;
                patchOrder({ paymentMethod: id });
              }}
            />
            </div>

            {error && (
              <p
                className="no-print"
                style={{
                  color: "#B45309",
                  fontSize: 14,
                  marginTop: 12,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                {error}
              </p>
            )}
            <ValidationError
              className="no-print"
              errors={formspree.errors}
              style={{
                color: "#B45309",
                fontSize: 14,
                marginTop: 12,
                fontFamily: "system-ui, -apple-system, sans-serif",
                display: "block",
              }}
            />

            <script
              id="order-notification-payload"
              type="application/json"
              data-testid="order-notification-payload"
              hidden
              aria-hidden="true"
              dangerouslySetInnerHTML={{
                __html: serializeOrderPayload(notification),
              }}
            />

            <form
              className="no-print"
              onSubmit={handleOrderSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}
            >
              <input
                type="text"
                name="_gotcha"
                tabIndex={-1}
                autoComplete="off"
                style={{
                  position: "absolute",
                  left: "-10000px",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                }}
                aria-hidden="true"
              />
              {!submitted && (
                <button
                  type="submit"
                  disabled={formspree.submitting}
                  style={{ ...ctaStyle, background: "#0F766E", color: "#F0FBF9" }}
                >
                  {formspree.submitting ? "Sending…" : "Submit order"}
                </button>
              )}
              {submitted && (
                <button
                  type="button"
                  onClick={handlePrint}
                  style={{ ...ctaStyle, background: "#0F766E", color: "#F0FBF9" }}
                >
                  Print invoice
                </button>
              )}
              <button
                type="button"
                onClick={handleReset}
                style={{
                  background: "none",
                  border: "none",
                  color: "#5C8A83",
                  fontSize: 14,
                  padding: "8px 0",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                Start a new order
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      {step === "form" && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#FFFFFF",
            borderTop: "1px solid #BFE3DD",
            padding: "14px 20px",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ maxWidth: 440, margin: "0 auto" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontSize: 14,
                color: "#3F6560",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span data-testid="order-item-count">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </span>
                {showShipping ? (
                  <span data-testid="order-subtotal">{currency(itemTotal)}</span>
                ) : (
                  <span
                    data-testid="order-total"
                    style={{ fontWeight: 700, color: "#16302C" }}
                  >
                    {currency(total)}
                  </span>
                )}
              </div>
              {showShipping && (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Shipping</span>
                    <span data-testid="order-shipping">
                      {currency(shipping.cost)}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontWeight: 700,
                      color: "#16302C",
                    }}
                  >
                    <span>Total</span>
                    <span data-testid="order-total">{currency(total)}</span>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleReview}
              style={{
                width: "100%",
                padding: "14px 0",
                borderRadius: 12,
                border: "none",
                background: "#0F766E",
                color: "#F0FBF9",
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              Review order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentAccordion({ paymentMethod, onSelect, fulfillment, total, notes }) {
  const selectedLabel = paymentMethodLabel(paymentMethod);

  return (
    <details
      data-testid="payment-accordion"
      style={{
        background: "#FFFFFF",
        border: "1px solid #BFE3DD",
        borderRadius: 16,
        padding: "14px 18px 16px",
        marginTop: 12,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 15,
          color: "#16302C",
        }}
      >
        {selectedLabel ? `Payment · ${selectedLabel}` : "Payment"}
      </summary>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginTop: 14,
        }}
      >
        {PAYMENT_METHODS.map((method) => {
          const disabled =
            Boolean(method.pickupOnly) && fulfillment === "delivery";
          const selected = paymentMethod === method.id;
          const payUrl = selected ? paymentLink(method.id, total, notes) : "";

          return (
            <div key={method.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  opacity: disabled ? 0.55 : 1,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 15,
                    color: "#16302C",
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="payment-method"
                    value={method.id}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => onSelect(method.id)}
                  />
                  {method.label}
                </label>
                {disabled && (
                  <span
                    style={{
                      fontSize: 12,
                      color: "#5C8A83",
                    }}
                  >
                    Pickup only
                  </span>
                )}
              </div>
              {selected && method.pickupOnly && !disabled && (
                <p
                  data-testid="apple-pay-note"
                  style={{
                    margin: "8px 0 0 28px",
                    fontSize: 13,
                    color: "#3F6560",
                  }}
                >
                  {method.note}
                </p>
              )}
              {selected && method.handle && payUrl && (
                <div
                  style={{
                    margin: "10px 0 0 28px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <a
                    href={payUrl}
                    data-testid={`payment-handle-${method.id}`}
                    style={{
                      color: "#0F766E",
                      fontWeight: 600,
                      fontSize: 14,
                      textDecoration: "none",
                    }}
                  >
                    {method.handle}
                  </a>
                  <div data-testid={`payment-qr-${method.id}`}>
                    <QRCodeSVG
                      value={payUrl}
                      size={168}
                      title={`QR code to pay ${currency(total)} with ${method.label}`}
                    />
                  </div>
                  <span style={{ fontSize: 13, color: "#3F6560" }}>
                    Scan to pay {currency(total)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function FlavorSection({ flavor, qty, onChangeQty }) {
  const subtotal = flavorSubtotal(qty, flavor);

  return (
    <div
      data-testid={`flavor-${flavor.id}`}
      style={{
        background: "#FFFFFF",
        border: "1px solid #BFE3DD",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "14px 16px 10px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {flavor.name}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#5C8A83",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {flavor.note}
          </div>
        </div>
        <div
          data-testid={`flavor-${flavor.id}-subtotal`}
          style={{
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: subtotal > 0 ? "#0F766E" : "#5C8A83",
            paddingTop: 2,
          }}
        >
          {currency(subtotal)}
        </div>
      </div>
      {flavor.products.map((product) => {
        const n = getQty(qty, flavor.id, product.id);
        const lineTotal = n * product.price;
        const label = `${flavor.name} ${product.name}`;
        return (
          <div
            key={product.id}
            data-testid={`line-${flavor.id}-${product.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              borderTop: "1px solid #E6F7F4",
              background: n > 0 ? "#F7FCFB" : "#FFFFFF",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                {product.name}
              </div>
              <div
                data-testid={`line-${flavor.id}-${product.id}-amount`}
                style={{
                  fontSize: 12,
                  color: "#5C8A83",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                {n > 0
                  ? `${currency(product.price)} each · ${currency(lineTotal)}`
                  : `${currency(product.price)} each`}
              </div>
            </div>
            <Stepper
              label={label}
              value={n}
              testId={`qty-${flavor.id}-${product.id}`}
              onDecrease={() => onChangeQty(flavor.id, product.id, -1)}
              onIncrease={() => onChangeQty(flavor.id, product.id, 1)}
            />
          </div>
        );
      })}
    </div>
  );
}

function SectionLabel({ children, style }) {
  return (
    <p
      style={{
        fontSize: 13,
        color: "#5C8A83",
        margin: "0 0 10px 4px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontSize: 13,
          color: "#5C8A83",
          marginBottom: 4,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function Stepper({ value, onDecrease, onIncrease, label, testId }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={onDecrease}
        disabled={value === 0}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "1px solid #BFE3DD",
          background: value === 0 ? "#EAF7F4" : "#FFFFFF",
          color: value === 0 ? "#CFE8E3" : "#0F766E",
          fontSize: 18,
          lineHeight: "0",
          fontWeight: 700,
        }}
      >
        −
      </button>
      <span
        data-testid={testId}
        style={{
          minWidth: 18,
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={onIncrease}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "1px solid #0F766E",
          background: "#0F766E",
          color: "#F0FBF9",
          fontSize: 18,
          lineHeight: "0",
          fontWeight: 700,
        }}
      >
        +
      </button>
    </div>
  );
}

function EditIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M11.13 2.13a1.5 1.5 0 0 1 2.12 2.12L5.5 12H3v-2.5l8.13-8.37Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9.75 3.5l2.75 2.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function JarIcon() {
  return (
    <svg width="40" height="44" viewBox="0 0 40 44" fill="none">
      <rect x="8" y="2" width="24" height="6" rx="2" fill="#FBBF24" />
      <rect
        x="6"
        y="8"
        width="28"
        height="34"
        rx="6"
        fill="#F0FBF9"
        stroke="#FBBF24"
        strokeWidth="2"
      />
      <path d="M6 20h28" stroke="#FBBF24" strokeWidth="1.2" opacity="0.6" />
      <path d="M6 30h28" stroke="#FBBF24" strokeWidth="1.2" opacity="0.6" />
    </svg>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #BFE3DD",
  background: "#FFFFFF",
  fontSize: 15,
  fontFamily: "system-ui, -apple-system, sans-serif",
  color: "#16302C",
};

const ctaStyle = {
  display: "block",
  textAlign: "center",
  padding: "13px 0",
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 700,
  textDecoration: "none",
  fontFamily: "system-ui, -apple-system, sans-serif",
};
