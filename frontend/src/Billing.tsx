import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./App.css";

type BillingMode = "create" | "renew";
type CheckoutStatus = "idle" | "authorizing" | "declined" | "succeeded";

interface SubscriptionSummary {
  subscriptionId: string;
  userId: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

interface CheckoutSuccessState {
  payment: {
    paymentId: string;
    amountCents: number;
    currency: string;
    status: string;
    provider: string;
    transactionId: string;
    cardBrand: string;
    cardLast4: string;
    billingEmail: string;
    createdAt: string;
  };
  subscription: SubscriptionSummary;
}

interface BillingFormState {
  cardholderName: string;
  billingEmail: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvc: string;
}

const initialFormState: BillingFormState = {
  cardholderName: "",
  billingEmail: "",
  cardNumber: "",
  expiryMonth: "",
  expiryYear: "",
  cvc: "",
};

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

function luhnValid(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D+/g, "");
  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (Number.isNaN(digit)) return false;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

function getCardBrand(cardNumber: string): string {
  const digits = cardNumber.replace(/\D+/g, "");
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "Amex";
  return "Card";
}

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D+/g, "").slice(0, 19);
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join(" ") : "";
}

function formatPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

function getValidationError(form: BillingFormState): string | null {
  if (form.cardholderName.trim().length < 2) return "Enter the cardholder name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.billingEmail.trim())) return "Enter a valid billing email.";
  if (!luhnValid(form.cardNumber)) return "Enter a valid card number.";

  const expiryMonth = Number(form.expiryMonth);
  const expiryYear = Number(form.expiryYear);
  if (!Number.isInteger(expiryMonth) || expiryMonth < 1 || expiryMonth > 12) return "Expiry month is invalid.";
  if (!Number.isInteger(expiryYear) || expiryYear < new Date().getFullYear()) return "Expiry year is invalid.";

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (expiryYear === currentYear && expiryMonth < currentMonth) return "This card has expired.";

  if (!/^\d{3,4}$/.test(form.cvc.trim())) return "Enter a valid security code.";
  return null;
}

export default function Billing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = localStorage.getItem("jwt_token");
  const mode = (searchParams.get("mode") === "renew" ? "renew" : "create") as BillingMode;
  const [form, setForm] = useState<BillingFormState>(initialFormState);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [successState, setSuccessState] = useState<CheckoutSuccessState | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus>("idle");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    Promise.all([
      fetch("/api/subscription/status", {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
      fetch("/api/subscription/details", {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (r) => (r.ok ? r.json() : null)),
    ])
      .then(([statusData, detailsData]) => {
        setIsPremium(Boolean(statusData.isPremium));
        setSubscription(detailsData);
      })
      .catch(() => {
        setError("Failed to load billing context.");
      })
      .finally(() => setLoading(false));
  }, [token, navigate]);

  useEffect(() => {
    if (!successState) return;

    const timeout = window.setTimeout(() => {
      navigate("/premium", {
        replace: true,
        state: {
          billingMessage:
            mode === "renew"
              ? "Subscription renewed successfully."
              : "Premium is now active.",
          refreshSubscription: true,
        },
      });
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [successState, mode, navigate]);

  const pageCopy = useMemo(() => {
    if (mode === "renew") {
      return {
        kicker: "Renew Premium",
        title: "Extend your premium access",
        subtitle: "Run a fresh monthly charge through the mock card vendor and add another month to your subscription.",
        cta: "Pay and renew",
      };
    }

    return {
      kicker: "Checkout",
      title: "Complete your Premium upgrade",
      subtitle: "Enter your billing details and the mock card vendor will approve or decline the payment like a real checkout flow.",
      cta: "Pay and upgrade",
    };
  }, [mode]);

  const priceLabel = formatPrice(100, "EUR");
  const validationError = getValidationError(form);
  const canSubmit = !loading && !isSubmitting && !successState && !validationError;

  const handleChange = (key: keyof BillingFormState, value: string) => {
    const nextValue = key === "cardNumber" ? formatCardNumber(value) : value;
    setForm((prev) => ({ ...prev, [key]: nextValue }));
    if (error) setError("");
    if (checkoutStatus === "declined") {
      setCheckoutStatus("idle");
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      navigate("/login");
      return;
    }

    if (validationError) {
      setError(validationError);
      setCheckoutStatus("declined");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setCheckoutStatus("authorizing");

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          cardholderName: form.cardholderName.trim(),
          billingEmail: form.billingEmail.trim(),
          cardNumber: form.cardNumber.replace(/\D+/g, ""),
          expiryMonth: Number(form.expiryMonth),
          expiryYear: Number(form.expiryYear),
          cvc: form.cvc.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to process billing.");
      }

      setSuccessState(data);
      setIsPremium(true);
      setSubscription(data.subscription);
      setCheckoutStatus("succeeded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process billing.");
      setCheckoutStatus("declined");
    } finally {
      setIsSubmitting(false);
    }
  };

  const continueToPremium = () => {
    if (!successState) {
      navigate("/premium");
      return;
    }

    navigate("/premium", {
      replace: true,
      state: {
        billingMessage:
          mode === "renew"
            ? "Subscription renewed successfully."
            : "Premium is now active.",
        refreshSubscription: true,
      },
    });
  };

  if (loading) {
    return (
      <div className="billing-page billing-loading">
        <div className="billing-loading-copy">Loading checkout...</div>
      </div>
    );
  }

  return (
    <div className="billing-page">
      <motion.div
        className="billing-shell"
        initial="hidden"
        animate="visible"
        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } }}
      >
        <motion.section className="billing-hero" variants={fadeUp}>
          <span className="billing-kicker">{pageCopy.kicker}</span>
          <h1 className="billing-title">{pageCopy.title}</h1>
          <p className="billing-subtitle">{pageCopy.subtitle}</p>
          <div className="billing-note-row">
            <span className="billing-note-pill">Mock provider: `MOCKCARD`</span>
            <span className="billing-note-pill">Price: {priceLabel} / month</span>
            <span className="billing-note-pill">{isPremium ? "Premium account detected" : "New activation"}</span>
          </div>
        </motion.section>

        <div className="billing-layout">
          <motion.form className="billing-surface billing-form" variants={fadeUp} onSubmit={handleSubmit}>
            <div className="billing-section-head">
              <span className="billing-section-kicker">Payment details</span>
              <h2>Card checkout</h2>
              <p>We validate the form like a real checkout, but only safe metadata is stored after approval.</p>
            </div>

            {checkoutStatus === "authorizing" && (
              <div className="billing-alert billing-alert-info">
                Mock vendor is authorizing the card now. Please wait a moment.
              </div>
            )}
            {error && (
              <div className="billing-alert billing-alert-error">
                Payment was not approved. {error}
              </div>
            )}
            {!error && validationError && (
              <div className="billing-alert billing-alert-muted">{validationError}</div>
            )}

            <label className="billing-field">
              <span>Cardholder name</span>
              <input
                type="text"
                value={form.cardholderName}
                onChange={(e) => handleChange("cardholderName", e.target.value)}
                placeholder="Alex Johnson"
                autoComplete="cc-name"
              />
            </label>

            <label className="billing-field">
              <span>Billing email</span>
              <input
                type="email"
                value={form.billingEmail}
                onChange={(e) => handleChange("billingEmail", e.target.value)}
                placeholder="alex@example.com"
                autoComplete="email"
              />
            </label>

            <label className="billing-field">
              <span>Card number</span>
              <input
                type="text"
                value={form.cardNumber}
                onChange={(e) => handleChange("cardNumber", e.target.value)}
                placeholder="4242 4242 4242 4242"
                autoComplete="cc-number"
                inputMode="numeric"
                maxLength={23}
              />
              <small>{getCardBrand(form.cardNumber)}</small>
            </label>

            <div className="billing-field-grid billing-field-grid-compact">
              <label className="billing-field">
                <span>Expiry month</span>
                <input
                  type="text"
                  value={form.expiryMonth}
                  onChange={(e) => handleChange("expiryMonth", e.target.value)}
                  placeholder="12"
                  autoComplete="cc-exp-month"
                  inputMode="numeric"
                  maxLength={2}
                />
              </label>

              <label className="billing-field">
                <span>Expiry year</span>
                <input
                  type="text"
                  value={form.expiryYear}
                  onChange={(e) => handleChange("expiryYear", e.target.value)}
                  placeholder={String(new Date().getFullYear() + 1)}
                  autoComplete="cc-exp-year"
                  inputMode="numeric"
                  maxLength={4}
                />
              </label>

              <label className="billing-field">
                <span>CVC</span>
                <input
                  type="password"
                  value={form.cvc}
                  onChange={(e) => handleChange("cvc", e.target.value)}
                  placeholder="123"
                  autoComplete="cc-csc"
                  inputMode="numeric"
                  maxLength={4}
                />
              </label>
            </div>

            <div className="billing-actions">
              <button type="submit" className="billing-submit-btn" disabled={!canSubmit}>
                {isSubmitting ? "Authorizing..." : pageCopy.cta}
              </button>
              <button type="button" className="billing-secondary-btn" onClick={() => navigate("/premium")}>
                Back to Premium
              </button>
            </div>
          </motion.form>

          <motion.aside className="billing-surface billing-sidebar" variants={fadeUp}>
            <div className="billing-section-head">
              <span className="billing-section-kicker">Order summary</span>
              <h2>{mode === "renew" ? "Renewal summary" : "Upgrade summary"}</h2>
              <p>One monthly charge, immediate activation, and no long-term commitment.</p>
            </div>

            <div className="billing-summary-list">
              <div className="billing-summary-row">
                <span>Premium plan</span>
                <strong>{priceLabel}</strong>
              </div>
              <div className="billing-summary-row">
                <span>Billing cadence</span>
                <strong>Monthly</strong>
              </div>
              <div className="billing-summary-row">
                <span>Provider</span>
                <strong>Mock card gateway</strong>
              </div>
              <div className="billing-summary-row">
                <span>Status after approval</span>
                <strong>{mode === "renew" ? "Subscription extended" : "Premium activated"}</strong>
              </div>
            </div>

            <div className={`billing-status-card billing-status-${checkoutStatus}`}>
              <span className="billing-status-label">Checkout state</span>
              <strong>
                {checkoutStatus === "idle" && "Waiting for payment details"}
                {checkoutStatus === "authorizing" && "Authorizing payment"}
                {checkoutStatus === "declined" && "Payment declined or invalid"}
                {checkoutStatus === "succeeded" && "Payment approved"}
              </strong>
            </div>

            {subscription && (
              <div className="billing-existing-subscription">
                <h3>Current subscription</h3>
                <p>
                  Active window:{" "}
                  <strong>
                    {new Date(subscription.startDate).toLocaleDateString("en-US")} to{" "}
                    {new Date(subscription.endDate).toLocaleDateString("en-US")}
                  </strong>
                </p>
              </div>
            )}

            <div className="billing-test-cards">
              <h3>Checkout test cards</h3>
              <p>`4242 4242 4242 4242` approves when the form is valid.</p>
              <p>`4000 0000 0000 0002` forces a decline so you can test the error state.</p>
              <p>No full card number or CVC is stored after the request is processed.</p>
            </div>
          </motion.aside>
        </div>

        {successState && (
          <motion.section className="billing-surface billing-success" variants={fadeUp}>
            <span className="billing-section-kicker">Payment approved</span>
            <h2>{mode === "renew" ? "Your subscription has been extended" : "Premium is now active"}</h2>
            <p>
              Transaction {successState.payment.transactionId} was approved by {successState.payment.provider}.
              The stored card reference is {successState.payment.cardBrand} ending in {successState.payment.cardLast4}.
            </p>
            <div className="billing-success-grid">
              <div>
                <span>Charged</span>
                <strong>{formatPrice(successState.payment.amountCents, successState.payment.currency)}</strong>
              </div>
              <div>
                <span>Next period ends</span>
                <strong>{new Date(successState.subscription.endDate).toLocaleDateString("en-US")}</strong>
              </div>
            </div>
            <button type="button" className="billing-submit-btn" onClick={continueToPremium}>
              Return to Premium
            </button>
          </motion.section>
        )}
      </motion.div>
    </div>
  );
}
