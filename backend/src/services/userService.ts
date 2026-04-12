import pool from "../database";
import crypto from "crypto";
import { isUserPremium } from "./subscriptionService";
import { DEFAULT_HERO_COLOR_KEY, isHeroColorKey } from "../profileHeroThemes";

// JWT helpers
import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

type UserRow = {
  userid: string;
  name: string;
  nickname: string;
  email: string;
  password_hash: string;
  avatar_url?: string | null;
  background_image_url?: string | null;
  hero_color_key?: string | null;
  nickname_change_count?: number;
  nickname_changed_at?: Date | null;
  created_at: Date;
  updated_at?: Date;
};

export interface UserProfile {
  userid: string;
  email: string;
  name: string;
  nickname: string;
  avatar_url: string | null;
  background_image_url: string | null;
  hero_color_key: string;
  nicknameChangeCount: number;
  nicknameChangedAt: string | null;
  isPremium: boolean;
  nextNicknameChangeAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface PublicUserProfile {
  userid: string;
  name: string;
  nickname: string;
  avatar_url: string | null;
  background_image_url: string | null;
  hero_color_key: string;
  createdAt: string;
}

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

function normalizeNicknameBase(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function normalizeNickname(value: string) {
  return normalizeNicknameBase(value).slice(0, 30);
}

function getNicknameSeed(name: string) {
  const firstWord = name.trim().split(/\s+/).filter(Boolean)[0] || "";
  return normalizeNickname(firstWord) || normalizeNickname(name) || "chef";
}

async function getUniqueNickname(base: string) {
  const normalizedBase = normalizeNickname(base) || "chef";

  for (let index = 0; index < 500; index += 1) {
    const candidate = index === 0 ? normalizedBase : `${normalizedBase}${index + 1}`;
    const res = await pool.query(
      `SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) LIMIT 1`,
      [candidate]
    );
    if (res.rows.length === 0) {
      return candidate;
    }
  }

  return `${normalizedBase}${Date.now().toString().slice(-6)}`;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

async function mapUserProfile(row: UserRow): Promise<UserProfile> {
  const premium = await isUserPremium(row.userid);
  const nicknameChangedAt = row.nickname_changed_at ? new Date(row.nickname_changed_at) : null;
  const nextNicknameChangeAt = premium && nicknameChangedAt
    ? new Date(nicknameChangedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;

  return {
    userid: row.userid,
    email: row.email,
    name: row.name,
    nickname: row.nickname,
    avatar_url: row.avatar_url ?? null,
    background_image_url: row.background_image_url ?? null,
    hero_color_key: row.hero_color_key || DEFAULT_HERO_COLOR_KEY,
    nicknameChangeCount: Number(row.nickname_change_count ?? 0),
    nicknameChangedAt: toIso(row.nickname_changed_at),
    isPremium: premium,
    nextNicknameChangeAt: nextNicknameChangeAt ? nextNicknameChangeAt.toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: toIso(row.updated_at),
  };
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const res = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  return res.rows[0] || null;
}

export async function getUserById(userid: string): Promise<UserRow | null> {
  const res = await pool.query("SELECT * FROM users WHERE userid = $1::uuid", [userid]);
  return res.rows[0] || null;
}

export async function getUserByNickname(nickname: string): Promise<UserRow | null> {
  const res = await pool.query("SELECT * FROM users WHERE LOWER(nickname) = LOWER($1)", [nickname]);
  return res.rows[0] || null;
}

export async function createUser(name: string, email: string, password: string) {
  const existing = await getUserByEmail(email);
  if (existing) {
    const err: any = new Error("User already exists");
    err.code = "USER_EXISTS";
    throw err;
  }

  const nickname = await getUniqueNickname(getNicknameSeed(name));
  const { salt, hash } = hashPassword(password);
  const stored = `scrypt$${salt}$${hash}`;

  const res = await pool.query(
    `INSERT INTO users (name, nickname, email, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING userid, name, nickname, email, avatar_url, background_image_url, hero_color_key, nickname_change_count, nickname_changed_at, created_at, updated_at`,
    [name, nickname, email.toLowerCase(), stored]
  );

  return res.rows[0];
}

export async function authenticateUser(email: string, password: string) {
  const user = await getUserByEmail(email);
  if (!user) return null;
  if (!verifyPassword(user.password_hash, password)) return null;
  // JWT payload: minimal
  const token = jwt.sign({ userid: user.userid, email: user.email }, JWT_SECRET, { expiresIn: "2h" });
  return {
    token,
    user: {
      userid: user.userid,
      email: user.email,
      name: user.name,
      nickname: user.nickname,
      avatar_url: user.avatar_url ?? null,
      background_image_url: user.background_image_url ?? null,
      hero_color_key: user.hero_color_key || DEFAULT_HERO_COLOR_KEY,
    },
  };
}

export async function getCurrentUserProfile(userid: string): Promise<UserProfile | null> {
  const user = await getUserById(userid);
  if (!user) return null;
  return mapUserProfile(user);
}

export async function getPublicUserProfileByNickname(nickname: string): Promise<PublicUserProfile | null> {
  const user = await getUserByNickname(nickname);
  if (!user) return null;

  return {
    userid: user.userid,
    name: user.name,
    nickname: user.nickname,
    avatar_url: user.avatar_url ?? null,
    background_image_url: user.background_image_url ?? null,
    hero_color_key: user.hero_color_key || DEFAULT_HERO_COLOR_KEY,
    createdAt: new Date(user.created_at).toISOString(),
  };
}

export async function updateUserProfile(
  userid: string,
  input: {
    name: string;
    nickname: string;
    avatar_url?: string | null;
    background_image_url?: string | null;
    hero_color_key?: string;
  }
): Promise<UserProfile> {
  const current = await getUserById(userid);
  if (!current) {
    const err: any = new Error("User not found");
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    const err: any = new Error("name is required");
    err.code = "PROFILE_VALIDATION_ERROR";
    throw err;
  }

  const normalizedNickname = normalizeNickname(input.nickname);
  if (!normalizedNickname || normalizedNickname.length < 3) {
    const err: any = new Error("nickname must be at least 3 characters and use only letters, numbers, or underscores");
    err.code = "PROFILE_VALIDATION_ERROR";
    throw err;
  }

  const nextHeroColorKey = input.hero_color_key?.trim() || current.hero_color_key || DEFAULT_HERO_COLOR_KEY;
  if (!isHeroColorKey(nextHeroColorKey)) {
    const err: any = new Error("hero_color_key is invalid");
    err.code = "PROFILE_VALIDATION_ERROR";
    throw err;
  }

  const nextBackgroundImage =
    input.background_image_url === undefined ? current.background_image_url ?? null : input.background_image_url;
  const backgroundImageChanged = nextBackgroundImage !== (current.background_image_url ?? null);

  if (backgroundImageChanged) {
    const premium = await isUserPremium(userid);
    if (!premium) {
      const err: any = new Error("Premium membership is required to change hero images");
      err.code = "PREMIUM_REQUIRED";
      throw err;
    }
  }

  const nicknameChanged = normalizedNickname !== current.nickname;

  if (nicknameChanged) {
    const existing = await getUserByNickname(normalizedNickname);
    if (existing && existing.userid !== userid) {
      const err: any = new Error("Nickname is already taken");
      err.code = "NICKNAME_TAKEN";
      throw err;
    }

    const premium = await isUserPremium(userid);
    const changeCount = Number(current.nickname_change_count ?? 0);
    const changedAt = current.nickname_changed_at ? new Date(current.nickname_changed_at) : null;

    if (!premium && changeCount >= 1) {
      const err: any = new Error("Regular users can change nickname only once");
      err.code = "NICKNAME_CHANGE_LIMIT";
      throw err;
    }

    if (premium && changedAt) {
      const nextAllowedAt = new Date(changedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (nextAllowedAt.getTime() > Date.now()) {
        const err: any = new Error(`Premium users can change nickname once every 30 days. Next change available on ${nextAllowedAt.toISOString()}`);
        err.code = "NICKNAME_CHANGE_COOLDOWN";
        throw err;
      }
    }
  }

  await pool.query(
    `UPDATE users
     SET name = $1,
         nickname = $2,
         avatar_url = $3,
         background_image_url = $4,
         hero_color_key = $5,
         nickname_change_count = CASE WHEN $6 THEN COALESCE(nickname_change_count, 0) + 1 ELSE COALESCE(nickname_change_count, 0) END,
         nickname_changed_at = CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE nickname_changed_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE userid = $7::uuid`,
    [trimmedName, normalizedNickname, input.avatar_url ?? null, nextBackgroundImage, nextHeroColorKey, nicknameChanged, userid]
  );

  const updated = await getCurrentUserProfile(userid);
  if (!updated) {
    const err: any = new Error("User not found");
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  return updated;
}

export async function updateUserPassword(userid: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await getUserById(userid);
  if (!user) {
    const err: any = new Error("User not found");
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  if (!verifyPassword(user.password_hash, currentPassword)) {
    const err: any = new Error("Current password is incorrect");
    err.code = "INVALID_PASSWORD";
    throw err;
  }

  if (typeof newPassword !== "string" || newPassword.length < 6) {
    const err: any = new Error("password must be at least 6 characters");
    err.code = "PROFILE_VALIDATION_ERROR";
    throw err;
  }

  const { salt, hash } = hashPassword(newPassword);
  const stored = `scrypt$${salt}$${hash}`;

  await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE userid = $2::uuid`,
    [stored, userid]
  );
}

export { verifyPassword };
