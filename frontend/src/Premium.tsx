import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import "./App.css";

interface Subscription {
  subscriptionId: string;
  userId: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

interface PlanFeature {
  label: string;
  freeLabel: string;
  premiumLabel: string;
  freeIncluded: boolean;
  premiumIncluded: boolean;
}

const planComparison: PlanFeature[] = [
  {
    label: "Recipe uploads",
    freeLabel: "5 recipes",
    premiumLabel: "Unlimited",
    freeIncluded: true,
    premiumIncluded: true,
  },
  {
    label: "Recipe analytics",
    freeLabel: "Not included",
    premiumLabel: "Advanced insights",
    freeIncluded: false,
    premiumIncluded: true,
  },
  {
    label: "Support",
    freeLabel: "Standard queue",
    premiumLabel: "Priority support",
    freeIncluded: false,
    premiumIncluded: true,
  },
  {
    label: "Exclusive recipes",
    freeLabel: "Not included",
    premiumLabel: "Premium library access",
    freeIncluded: false,
    premiumIncluded: true,
  },
  {
    label: "Ad-free workspace",
    freeLabel: "Ads enabled",
    premiumLabel: "Clean experience",
    freeIncluded: false,
    premiumIncluded: true,
  },
];

const premiumBenefits = [
  {
    title: "Unlimited publishing",
    description: "Keep building your recipe collection without hitting a monthly upload ceiling.",
  },
  {
    title: "Cleaner workflow",
    description: "Stay focused with a simpler, ad-free experience while browsing and managing recipes.",
  },
  {
    title: "Faster help",
    description: "Get priority support when you need account or subscription questions answered quickly.",
  },
];

const faqItems = [
  {
    question: "How long does Premium last?",
    answer: "Each purchase activates Premium for one month from the moment the subscription is created.",
  },
  {
    question: "Can I cancel whenever I want?",
    answer: "Yes. Cancelling removes the subscription immediately, and you can subscribe again later whenever you want.",
  },
  {
    question: "When do premium features unlock?",
    answer: "Right after the subscription is created successfully. You do not need to leave or reload the page.",
  },
  {
    question: "What happens after Premium ends?",
    answer: "Your account and recipes stay safe. You just return to the free plan until you subscribe again.",
  },
];

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.12,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5 },
  },
  hover: {
    y: -6,
    boxShadow: "0 24px 48px rgba(6, 10, 18, 0.28)",
    transition: { duration: 0.25 },
  },
};

export default function Premium() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isPremium, setIsPremium] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const token = localStorage.getItem("jwt_token");

  const loadSubscriptionState = async () => {
    if (!token) {
      navigate("/login");
      return;
    }

    try {
      const [statusResponse, detailsResponse] = await Promise.all([
        fetch("/api/subscription/status", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/subscription/details", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const statusData = await statusResponse.json();
      const detailsData = detailsResponse.ok ? await detailsResponse.json() : null;

      setIsPremium(statusData.isPremium || false);
      setSubscription(detailsData && !detailsData.error ? detailsData : null);
    } catch (err) {
      console.error("Error loading subscription:", err);
      setError("Failed to load subscription information");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscriptionState();
  }, [token, navigate]);

  useEffect(() => {
    const routeState = location.state && typeof location.state === "object"
      ? (location.state as { billingMessage?: string; refreshSubscription?: boolean })
      : null;
    const billingMessage = routeState?.billingMessage ?? "";
    const refreshSubscription = routeState?.refreshSubscription === true;

    if (billingMessage) {
      setSuccess(billingMessage);
    }

    if (refreshSubscription) {
      setLoading(true);
      void loadSubscriptionState();
    }

    if (billingMessage || refreshSubscription) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const handleBecomePremium = () => {
    if (!token) {
      navigate("/login");
      return;
    }
    navigate("/billing?mode=create");
  };

  const handleRenew = () => {
    if (!token) {
      navigate("/login");
      return;
    }
    navigate("/billing?mode=renew");
  };

  const handleCancel = async () => {
    if (!window.confirm("Are you sure you want to cancel your premium subscription?")) {
      return;
    }

    if (!token) {
      navigate("/login");
      return;
    }

    setIsProcessing(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel subscription");
      }

      setIsPremium(false);
      setSubscription(null);
      setSuccess("Subscription cancelled. Your account is back on the free plan.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to cancel subscription"));
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const daysRemaining = subscription
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.endDate).getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const trustPoints = isPremium
    ? [
        "Premium features unlocked",
        `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`,
        "Cancel any time",
      ]
    : ["EUR 1 per month", "Instant activation", "Cancel any time"];

  const premiumIncludedFeatures = planComparison.filter((feature) => feature.premiumIncluded);

  if (loading) {
    return (
      <div className="premium-page premium-loading">
        <div className="premium-loading-spinner">Loading premium experience...</div>
      </div>
    );
  }

  return (
    <div className="premium-page">
      <motion.div
        className="premium-container"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.section className="premium-hero" variants={itemVariants}>
          <div className="premium-header">
            <motion.div
              className={`status-badge ${isPremium ? "status-active" : "status-inactive"}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
            >
              {isPremium ? "Membership active" : "Upgrade available"}
            </motion.div>
            <motion.h1
              className="premium-title"
              initial={{ opacity: 0, y: -24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.1 }}
            >
              Cook without limits.
            </motion.h1>
            <motion.p
              className="premium-subtitle"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
            >
              Premium gives you unlimited uploads, cleaner browsing, deeper insights, and
              faster support in one simple plan.
            </motion.p>
            <motion.div
              className="premium-trust-row"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {trustPoints.map((point) => (
                <motion.span key={point} className="premium-trust-pill" variants={itemVariants}>
                  {point}
                </motion.span>
              ))}
            </motion.div>
          </div>

          <motion.aside
            className="premium-surface premium-hero-panel"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
          >
            {isPremium && subscription ? (
              <>
                <p className="premium-panel-kicker">Your current plan</p>
                <h2 className="premium-panel-title">Premium is live on your account</h2>
                <p className="premium-panel-text">
                  Keep growing your recipe collection with every premium tool already unlocked.
                </p>
                <div className="premium-panel-stat-row premium-panel-stat-row-active">
                  <div className="premium-panel-stat">
                    <span>Active since</span>
                    <strong>{formatDate(subscription.startDate)}</strong>
                  </div>
                  <div className="premium-panel-stat">
                    <span>Ends on</span>
                    <strong>{formatDate(subscription.endDate)}</strong>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="premium-panel-kicker">One paid plan</p>
                <h2 className="premium-panel-title">Premium for EUR 1 per month</h2>
                <p className="premium-panel-text">
                  Start instantly, keep every premium feature in one place, and cancel whenever
                  you want.
                </p>
                <div className="premium-panel-stat-row">
                  <div className="premium-panel-stat">
                    <span>Activation</span>
                    <strong>Immediate</strong>
                  </div>
                  <div className="premium-panel-stat">
                    <span>Billing</span>
                    <strong>Monthly</strong>
                  </div>
                  <div className="premium-panel-stat">
                    <span>Commitment</span>
                    <strong>None</strong>
                  </div>
                </div>
              </>
            )}
          </motion.aside>
        </motion.section>

        {error && (
          <motion.div
            className="alert alert-error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {error}
          </motion.div>
        )}
        {success && (
          <motion.div
            className="alert alert-success"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {success}
          </motion.div>
        )}

        {isPremium && subscription ? (
          <motion.section className="premium-active" variants={itemVariants}>
            <div className="premium-dashboard">
              <motion.article
                className="premium-surface premium-summary-card"
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
              >
                <div className="premium-section-heading">
                  <span className="premium-section-kicker">Membership overview</span>
                  <h3>Your subscription details</h3>
                  <p>Keep track of your billing window and manage Premium without leaving this page.</p>
                </div>

                <motion.div
                  className="subscription-details"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <motion.div className="detail-item" variants={itemVariants}>
                    <span className="detail-label">Active since</span>
                    <span className="detail-value">{formatDate(subscription.startDate)}</span>
                  </motion.div>
                  <motion.div className="detail-item" variants={itemVariants}>
                    <span className="detail-label">Expires on</span>
                    <span className="detail-value premium-expiry">{formatDate(subscription.endDate)}</span>
                  </motion.div>
                  <motion.div className="detail-item" variants={itemVariants}>
                    <span className="detail-label">Days remaining</span>
                    <span className="detail-value">{daysRemaining}</span>
                  </motion.div>
                </motion.div>

                <div className="premium-actions">
                  <motion.button
                    onClick={handleRenew}
                    disabled={isProcessing}
                    className="btn btn-primary"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isProcessing ? "Processing..." : "Renew subscription"}
                  </motion.button>
                  <motion.button
                    onClick={handleCancel}
                    disabled={isProcessing}
                    className="btn btn-secondary"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isProcessing ? "Processing..." : "Cancel subscription"}
                  </motion.button>
                </div>
              </motion.article>

              <motion.article
                className="premium-surface premium-included-card"
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                transition={{ delay: 0.08 }}
              >
                <div className="premium-section-heading">
                  <span className="premium-section-kicker">Included right now</span>
                  <h3>Everything unlocked in Premium</h3>
                  <p>Your account currently has access to every feature listed below.</p>
                </div>

                <motion.ul
                  className="membership-list"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {premiumIncludedFeatures.map((feature) => (
                    <motion.li key={feature.label} variants={itemVariants}>
                      <span className="membership-list-label">{feature.label}</span>
                      <span className="membership-list-value">{feature.premiumLabel}</span>
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.article>
            </div>
          </motion.section>
        ) : (
          <motion.section className="premium-inactive" variants={itemVariants}>
            <div className="premium-plan-row">
              <div className="pricing-section pricing-two-tiers">
                <motion.article
                  className="pricing-card pricing-card-free premium-surface"
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover="hover"
                >
                  <div className="pricing-card-head">
                    <div className="pricing-card-top">
                      <span className="plan-kicker">Starter</span>
                    </div>
                    <h2>Free</h2>
                    <p className="pricing-description">
                      A light entry point for testing the product and saving a small set of recipes.
                    </p>
                    <div className="price price-free">
                      <span className="currency">$</span>
                      <span className="amount">0</span>
                      <span className="period">/forever</span>
                    </div>
                  </div>

                  <motion.ul
                    className="plan-list"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {planComparison.map((feature) => (
                      <motion.li
                        key={feature.label}
                        variants={itemVariants}
                        className={feature.freeIncluded ? "is-included" : "is-excluded"}
                      >
                        <span className="plan-list-marker">{feature.freeIncluded ? "✓" : "-"}</span>
                        <div className="plan-list-copy">
                          <span className="plan-list-title">{feature.label}</span>
                          <span className="plan-list-detail">{feature.freeLabel}</span>
                        </div>
                      </motion.li>
                    ))}
                  </motion.ul>

                  <motion.button
                    disabled
                    className="btn btn-free"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.24 }}
                  >
                    Current plan
                  </motion.button>
                </motion.article>

                <motion.article
                  className="pricing-card pricing-card-premium pricing-card-featured premium-surface"
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover="hover"
                  transition={{ delay: 0.08 }}
                >
                  <div className="pricing-card-head">
                    <div className="pricing-card-top">
                      <span className="plan-kicker">Premium</span>
                      <span className="premium-badge-featured">Best value</span>
                    </div>
                    <h2>Premium</h2>
                    <p className="pricing-description">
                      The full experience for creators who want more room, more insight, and less friction.
                    </p>
                    <div className="price">
                      <span className="currency">€</span>
                      <span className="amount">1</span>
                      <span className="period">/month</span>
                    </div>
                  </div>

                  <motion.ul
                    className="plan-list"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {planComparison.map((feature) => (
                      <motion.li key={feature.label} variants={itemVariants} className="is-included">
                        <span className="plan-list-marker">✓</span>
                        <div className="plan-list-copy">
                          <span className="plan-list-title">{feature.label}</span>
                          <span className="plan-list-detail">{feature.premiumLabel}</span>
                        </div>
                      </motion.li>
                    ))}
                  </motion.ul>

                  <motion.button
                    onClick={handleBecomePremium}
                    disabled={isProcessing}
                    className="btn btn-premium"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 }}
                  >
                    {isProcessing ? "Processing..." : "Upgrade to Premium"}
                  </motion.button>
                </motion.article>
            </div>

            </div>

            <motion.article
              className="premium-surface premium-comparison"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
              <div className="premium-section-heading">
                <span className="premium-section-kicker">Quick comparison</span>
                <h3>What actually changes with Premium</h3>
                <p>One glance is enough to see the difference between the free plan and the paid plan.</p>
              </div>

              <motion.div
                className="comparison-table-wrap"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th scope="col">Feature</th>
                      <th scope="col">Starter</th>
                      <th scope="col">Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planComparison.map((feature) => (
                      <motion.tr key={feature.label} variants={itemVariants}>
                        <th scope="row" className="comparison-feature-cell">
                          {feature.label}
                        </th>
                        <td data-column="Starter">
                          <div
                            className={`comparison-cell ${
                              feature.freeIncluded ? "is-included" : "is-missing"
                            }`}
                          >
                            <span className="comparison-cell-icon" aria-hidden="true">
                              {feature.freeIncluded ? "✓" : "—"}
                            </span>
                            <span className="comparison-cell-copy">{feature.freeLabel}</span>
                          </div>
                        </td>
                        <td data-column="Premium">
                          <div
                            className={`comparison-cell comparison-cell-premium ${
                              feature.premiumIncluded ? "is-included" : "is-missing"
                            }`}
                          >
                            <span className="comparison-cell-icon" aria-hidden="true">
                              {feature.premiumIncluded ? "✓" : "—"}
                            </span>
                            <span className="comparison-cell-copy">{feature.premiumLabel}</span>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            </motion.article>
          </motion.section>
        )}

        <motion.section className="premium-surface premium-benefits-panel" variants={itemVariants}>
          <div className="premium-section-heading">
            <span className="premium-section-kicker">
              {isPremium ? "Why Premium matters" : "Why upgrade"}
            </span>
            <h3>Built to feel faster, cleaner, and easier to manage</h3>
            <p>
              The Premium plan focuses on removing friction so the product feels better every time
              you come back to it.
            </p>
          </div>

          <motion.div
            className="premium-benefit-grid"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {premiumBenefits.map((benefit, index) => (
              <motion.article
                key={benefit.title}
                className="premium-benefit-card"
                variants={cardVariants}
                whileHover="hover"
              >
                <span className="premium-benefit-index">{`0${index + 1}`}</span>
                <h4>{benefit.title}</h4>
                <p>{benefit.description}</p>
              </motion.article>
            ))}
          </motion.div>
        </motion.section>

        <motion.section className="premium-surface premium-faq" variants={itemVariants}>
          <div className="premium-section-heading">
            <span className="premium-section-kicker">FAQ</span>
            <h3>Questions people usually ask first</h3>
            <p>Everything important about billing, access, and what happens after cancellation.</p>
          </div>

          <motion.div
            className="faq-items"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {faqItems.map((item) => (
              <motion.article key={item.question} className="faq-item" variants={itemVariants}>
                <h4>{item.question}</h4>
                <p>{item.answer}</p>
              </motion.article>
            ))}
          </motion.div>
        </motion.section>
      </motion.div>
    </div>
  );
}
