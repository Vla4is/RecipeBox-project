import pool from "../database";
import crypto from "crypto";

// JWT helpers
import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

type UserRow = {
  userid: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at?: Date;
};

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(stored: string, password: string) {
  // stored format: scrypt$<salt>$<hash>
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const verifyHash = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verifyHash, "hex"));
  } catch {
    return false;
  }
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const res = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  return res.rows[0] || null;
}

export async function createUser(name: string, email: string, password: string) {
  const existing = await getUserByEmail(email);
  if (existing) {
    const err: any = new Error("User already exists");
    err.code = "USER_EXISTS";
    throw err;
  }

  const { salt, hash } = hashPassword(password);
  const stored = `scrypt$${salt}$${hash}`;

  const res = await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING userid, name, email, created_at`,
    [name, email.toLowerCase(), stored]
  );

  return res.rows[0];
}

export async function authenticateUser(email: string, password: string) {
  const user = await getUserByEmail(email);
  if (!user) return null;
  if (!verifyPassword(user.password_hash, password)) return null;
  // JWT payload: minimal
  const token = jwt.sign({ userid: user.userid, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "2h" });
  return { token, user: { userid: user.userid, email: user.email, name: user.name } };
}

export { verifyPassword };
