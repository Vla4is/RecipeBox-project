import pool from "../database";

/**
 * Get subscription details for a specific user
 */
export async function getSubscriptionByUserId(userId: string) {
  const res = await pool.query(
    "SELECT * FROM subscriptions WHERE userid = $1",
    [userId]
  );
  return res.rows[0] || null;
}

/**
 * Check if a user has an active premium subscription
 * Returns true only if subscription exists AND subscription_end_date > NOW()
 */
export async function isUserPremium(userId: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT EXISTS(
      SELECT 1 FROM subscriptions 
      WHERE userid = $1 AND subscription_end_date > NOW()
    ) AS is_premium`,
    [userId]
  );
  return res.rows[0].is_premium;
}

/**
 * Create a new subscription for a user
 * Sets subscription_start_date to NOW()
 * Sets subscription_end_date to 1 month from NOW()
 */
export async function createSubscription(userId: string) {
  const res = await pool.query(
    `INSERT INTO subscriptions (userid, subscription_start_date, subscription_end_date)
     VALUES ($1, NOW(), NOW() + INTERVAL '1 month')
     RETURNING *`,
    [userId]
  );
  return res.rows[0];
}

/**
 * Renew a subscription for 1 month
 * If renewal happens mid-day, extends the end_date by 1 month
 * This is fair: users always get exactly 1 month from renewal time
 */
export async function renewSubscription(userId: string) {
  const res = await pool.query(
    `UPDATE subscriptions 
     SET subscription_end_date = subscription_end_date + INTERVAL '1 month',
         updated_at = NOW()
     WHERE userid = $1
     RETURNING *`,
    [userId]
  );
  return res.rows[0] || null;
}

/**
 * Extend subscription end date to end of current day (grace period)
 * Useful if user renews late in the day
 */
export async function extendSubscriptionToEndOfDay(userId: string) {
  const res = await pool.query(
    `UPDATE subscriptions 
     SET subscription_end_date = (CURRENT_DATE + INTERVAL '1 day' - INTERVAL '1 second')::timestamp,
         updated_at = NOW()
     WHERE userid = $1
     RETURNING *`,
    [userId]
  );
  return res.rows[0] || null;
}

/**
 * Get all users with active premium subscriptions
 * Useful for analytics and mailouts
 */
export async function getActivePremiumUsers() {
  const res = await pool.query(
    `SELECT u.userid, u.name, u.email, s.subscription_end_date
     FROM users u
     INNER JOIN subscriptions s ON u.userid = s.userid
     WHERE s.subscription_end_date > NOW()
     ORDER BY s.subscription_end_date DESC`
  );
  return res.rows;
}

/**
 * Get all users with expired subscriptions
 * Useful for follow-up campaigns or cleanup
 */
export async function getExpiredSubscriptions() {
  const res = await pool.query(
    `SELECT u.userid, u.name, u.email, s.subscription_end_date
     FROM users u
     INNER JOIN subscriptions s ON u.userid = s.userid
     WHERE s.subscription_end_date <= NOW()
     ORDER BY s.subscription_end_date DESC`
  );
  return res.rows;
}

/**
 * Cancel (delete) a subscription
 * Used if user wants to downgrade immediately
 */
export async function cancelSubscription(userId: string) {
  const res = await pool.query(
    "DELETE FROM subscriptions WHERE userid = $1 RETURNING *",
    [userId]
  );
  return res.rows[0] || null;
}

/**
 * Get subscription expiry date formatted nicely
 */
export async function getSubscriptionExpiryDate(userId: string): Promise<string | null> {
  const sub = await getSubscriptionByUserId(userId);
  return sub ? new Date(sub.subscription_end_date).toISOString() : null;
}
