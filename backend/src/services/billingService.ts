import { PoolClient } from "pg";
import pool from "../database";
import { chargeMockCard } from "./mockCardGatewayService";

export type BillingCheckoutMode = "create" | "renew";

export interface BillingCheckoutInput {
  userId: string;
  mode: BillingCheckoutMode;
  cardholderName: string;
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvc: string;
  billingEmail: string;
}

export interface BillingCheckoutResult {
  payment: {
    paymentId: string;
    amountCents: number;
    currency: string;
    status: "SUCCEEDED";
    provider: "MOCKCARD";
    transactionId: string;
    cardBrand: string;
    cardLast4: string;
    billingEmail: string;
    createdAt: Date;
  };
  subscription: {
    subscriptionId: string;
    userId: string;
    startDate: Date;
    endDate: Date;
    createdAt: Date;
    updatedAt: Date;
  };
}

const PREMIUM_PRICE_CENTS = 100;
const PREMIUM_CURRENCY = "EUR";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeCardNumber(cardNumber: string): string {
  return cardNumber.replace(/\D+/g, "");
}

function validateBillingInput(input: BillingCheckoutInput): string | null {
  if (input.mode !== "create" && input.mode !== "renew") {
    return "Invalid checkout mode.";
  }

  if (input.cardholderName.trim().length < 2) {
    return "Cardholder name is required.";
  }

  const normalizedCardNumber = normalizeCardNumber(input.cardNumber);
  if (normalizedCardNumber.length < 13 || normalizedCardNumber.length > 19) {
    return "Card number must be between 13 and 19 digits.";
  }

  if (!Number.isInteger(input.expiryMonth) || input.expiryMonth < 1 || input.expiryMonth > 12) {
    return "Expiry month is invalid.";
  }

  if (!Number.isInteger(input.expiryYear) || input.expiryYear < 2000 || input.expiryYear > 2100) {
    return "Expiry year is invalid.";
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  if (
    input.expiryYear < currentYear ||
    (input.expiryYear === currentYear && input.expiryMonth < currentMonth)
  ) {
    return "Card has expired.";
  }

  if (!/^\d{3,4}$/.test(input.cvc.trim())) {
    return "Security code is invalid.";
  }

  if (!isValidEmail(input.billingEmail.trim())) {
    return "Billing email is invalid.";
  }

  return null;
}

async function getExistingSubscription(client: PoolClient, userId: string) {
  const res = await client.query(
    `SELECT subscriptionid, userid, subscription_start_date, subscription_end_date, created_at, updated_at
     FROM subscriptions
     WHERE userid = $1`,
    [userId]
  );

  return res.rows[0] || null;
}

async function createOrRenewSubscription(client: PoolClient, userId: string, mode: BillingCheckoutMode) {
  const existingSubscription = await getExistingSubscription(client, userId);
  const hasActiveSubscription = Boolean(
    existingSubscription && new Date(existingSubscription.subscription_end_date).getTime() > Date.now()
  );

  if (mode === "create" && hasActiveSubscription) {
    const error = new Error("User already has an active subscription");
    (error as Error & { code?: string }).code = "SUBSCRIPTION_EXISTS";
    throw error;
  }

  if (mode === "renew" && !existingSubscription) {
    const error = new Error("No subscription found to renew");
    (error as Error & { code?: string }).code = "SUBSCRIPTION_MISSING";
    throw error;
  }

  if (!existingSubscription) {
    const created = await client.query(
      `INSERT INTO subscriptions (userid, subscription_start_date, subscription_end_date)
       VALUES ($1, NOW(), NOW() + INTERVAL '1 month')
       RETURNING subscriptionid, userid, subscription_start_date, subscription_end_date, created_at, updated_at`,
      [userId]
    );

    return created.rows[0];
  }

  const updated = await client.query(
    `UPDATE subscriptions
     SET subscription_start_date = CASE
           WHEN subscription_end_date <= NOW() THEN NOW()
           ELSE subscription_start_date
         END,
         subscription_end_date = GREATEST(subscription_end_date, NOW()) + INTERVAL '1 month',
         updated_at = NOW()
     WHERE userid = $1
     RETURNING subscriptionid, userid, subscription_start_date, subscription_end_date, created_at, updated_at`,
    [userId]
  );

  return updated.rows[0];
}

async function insertPaymentRecord(
  client: PoolClient,
  params: {
    userId: string;
    subscriptionId: string | null;
    status: "SUCCEEDED" | "DECLINED" | "FAILED";
    provider: "MOCKCARD";
    providerTransactionId: string;
    amountCents: number;
    currency: string;
    cardholderName: string;
    cardBrand: string;
    cardLast4: string;
    billingEmail: string;
    failureReason?: string;
  }
) {
  const inserted = await client.query(
    `INSERT INTO payments (
       userid,
       subscriptionid,
       status,
       provider,
       provider_transaction_id,
       amount_cents,
       currency,
       cardholder_name,
       card_brand,
       card_last4,
       billing_email,
       failure_reason
     )
     VALUES ($1, $2, $3::payment_status_enum, $4::payment_provider_enum, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING paymentid, amount_cents, currency, status, provider, provider_transaction_id, card_brand, card_last4, billing_email, created_at`,
    [
      params.userId,
      params.subscriptionId,
      params.status,
      params.provider,
      params.providerTransactionId,
      params.amountCents,
      params.currency,
      params.cardholderName,
      params.cardBrand,
      params.cardLast4,
      params.billingEmail,
      params.failureReason ?? null,
    ]
  );

  return inserted.rows[0];
}

export async function processPremiumCheckout(input: BillingCheckoutInput): Promise<BillingCheckoutResult> {
  const validationError = validateBillingInput(input);
  if (validationError) {
    const error = new Error(validationError);
    (error as Error & { code?: string }).code = "BILLING_VALIDATION_ERROR";
    throw error;
  }

  const gatewayResult = await chargeMockCard({
    amountCents: PREMIUM_PRICE_CENTS,
    currency: PREMIUM_CURRENCY,
    cardholderName: input.cardholderName.trim(),
    cardNumber: normalizeCardNumber(input.cardNumber),
    expiryMonth: input.expiryMonth,
    expiryYear: input.expiryYear,
    cvc: input.cvc.trim(),
    billingEmail: input.billingEmail.trim().toLowerCase(),
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!gatewayResult.approved) {
      await insertPaymentRecord(client, {
        userId: input.userId,
        subscriptionId: null,
        status: "DECLINED",
        provider: gatewayResult.provider,
        providerTransactionId: gatewayResult.transactionId,
        amountCents: PREMIUM_PRICE_CENTS,
        currency: PREMIUM_CURRENCY,
        cardholderName: input.cardholderName.trim(),
        cardBrand: gatewayResult.cardBrand,
        cardLast4: gatewayResult.cardLast4,
        billingEmail: input.billingEmail.trim().toLowerCase(),
        failureReason: gatewayResult.declineReason,
      });

      await client.query("COMMIT");

      const error = new Error(gatewayResult.declineReason || "Payment was declined.");
      (error as Error & { code?: string }).code = "PAYMENT_DECLINED";
      throw error;
    }

    const subscription = await createOrRenewSubscription(client, input.userId, input.mode);
    const payment = await insertPaymentRecord(client, {
      userId: input.userId,
      subscriptionId: subscription.subscriptionid,
      status: "SUCCEEDED",
      provider: gatewayResult.provider,
      providerTransactionId: gatewayResult.transactionId,
      amountCents: PREMIUM_PRICE_CENTS,
      currency: PREMIUM_CURRENCY,
      cardholderName: input.cardholderName.trim(),
      cardBrand: gatewayResult.cardBrand,
      cardLast4: gatewayResult.cardLast4,
      billingEmail: input.billingEmail.trim().toLowerCase(),
    });

    await client.query("COMMIT");

    return {
      payment: {
        paymentId: payment.paymentid,
        amountCents: Number(payment.amount_cents),
        currency: payment.currency,
        status: payment.status,
        provider: payment.provider,
        transactionId: payment.provider_transaction_id,
        cardBrand: payment.card_brand,
        cardLast4: payment.card_last4,
        billingEmail: payment.billing_email,
        createdAt: payment.created_at,
      },
      subscription: {
        subscriptionId: subscription.subscriptionid,
        userId: subscription.userid,
        startDate: subscription.subscription_start_date,
        endDate: subscription.subscription_end_date,
        createdAt: subscription.created_at,
        updatedAt: subscription.updated_at,
      },
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors so the original failure is preserved.
    }
    throw error;
  } finally {
    client.release();
  }
}
