import React, { useState, useMemo } from "react";
import {
  FLAVORS,
  applyQtyChange,
  currency,
  flavorSubtotal,
  getQty,
  orderLines,
} from "./order.js";

export default function JamOrderForm() {
  const [qty, setQty] = useState({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfillment, setFulfillment] = useState("pickup");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState("form");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => orderLines(qty), [qty]);
  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.n, 0),
    [lines]
  );
  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.amount, 0),
    [lines]
  );

  function changeQty(flavorId, productId, delta) {
    setQty((prev) => applyQtyChange(prev, flavorId, productId, delta));
  }

  function buildSummary() {
    return [
      "Jam order",
      ...lines.map(
        (line) => `${line.n} x ${line.label} — ${currency(line.amount)}`
      ),
      `Total (${itemCount} item${itemCount === 1 ? "" : "s"}): ${currency(total)}`,
      "",
      `Name: ${name}`,
      `Phone: ${phone}`,
      fulfillment === "pickup" ? "Fulfillment: Pickup" : "Fulfillment: Delivery",
      fulfillment === "delivery" && address ? `Address: ${address}` : null,
      notes ? `Notes: ${notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");
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
    if (!phone.trim()) {
      setError("Enter a phone number.");
      return;
    }
    if (fulfillment === "delivery" && !address.trim()) {
      setError("Enter a delivery address.");
      return;
    }
    setError("");
    setStep("summary");
  }

  function handleCopy() {
    navigator.clipboard?.writeText(buildSummary()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleReset() {
    setQty({});
    setName("");
    setPhone("");
    setFulfillment("pickup");
    setAddress("");
    setNotes("");
    setError("");
    setStep("form");
  }

  const smsHref = `sms:?&body=${encodeURIComponent(buildSummary())}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(
    `Jam order from ${name}`
  )}&body=${encodeURIComponent(buildSummary())}`;

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
      <div style={{ maxWidth: 440, margin: "0 auto", paddingBottom: 120 }}>
        {/* Header */}
        <div
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
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </Field>
              <Field label="Phone">
                <input
                  style={inputStyle}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 012-3456"
                  type="tel"
                />
              </Field>

              <Field label="Fulfillment">
                <div style={{ display: "flex", gap: 10 }}>
                  {["pickup", "delivery"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setFulfillment(opt)}
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
                <Field label="Delivery address">
                  <input
                    style={inputStyle}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Orchard Lane"
                  />
                </Field>
              )}

              <Field label="Notes (optional)">
                <textarea
                  style={{ ...inputStyle, height: 64, resize: "none" }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
        ) : (
          <div style={{ padding: "24px 20px 0" }}>
            <SectionLabel>Order summary</SectionLabel>
            <div
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
                <span>{currency(total)}</span>
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
                <div>{name}</div>
                <div>{phone}</div>
                <div>
                  {fulfillment === "pickup" ? "Pickup" : `Delivery — ${address}`}
                </div>
                {notes && <div>Note: {notes}</div>}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              <a
                href={smsHref}
                style={{ ...ctaStyle, background: "#0F766E", color: "#F0FBF9" }}
              >
                Text this order
              </a>
              <a
                href={mailHref}
                style={{
                  ...ctaStyle,
                  background: "#FFFFFF",
                  color: "#0F766E",
                  border: "1.5px solid #0F766E",
                }}
              >
                Email this order
              </a>
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  ...ctaStyle,
                  background: "#FFFFFF",
                  color: "#3F6560",
                  border: "1px solid #BFE3DD",
                }}
              >
                {copied ? "Copied!" : "Copy order details"}
              </button>
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
            </div>
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
                justifyContent: "space-between",
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontSize: 14,
                color: "#3F6560",
                marginBottom: 8,
              }}
            >
              <span data-testid="order-item-count">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </span>
              <span
                data-testid="order-total"
                style={{ fontWeight: 700, color: "#16302C" }}
              >
                {currency(total)}
              </span>
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
