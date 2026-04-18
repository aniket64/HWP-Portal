import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";
import {
  createUser,
  getAllUsers,
  getUserByEmail,
  getUserById,
  initDefaultPermissions,
  updateLastSignedIn,
} from "./db";

const SALT_ROUNDS = 12;
const JWT_EXPIRY = "7d";

// WICHTIG: Muss mit shared/const.ts COOKIE_NAME übereinstimmen,
// damit der Cookie vom Browser korrekt gesendet und vom Server gelesen wird.
const COOKIE_NAME = "app_session_id";

function getJwtSecret(): Uint8Array {
  const secret = ENV.cookieSecret || "fallback-dev-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createJWT(userId: number, role: string): Promise<string> {
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyJWT(
  token: string
): Promise<{ userId: number; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      userId: payload.userId as number,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader?: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(";")) {
    const [key, ...vals] = part.trim().split("=");
    if (key) map.set(key.trim(), decodeURIComponent(vals.join("=")));
  }
  return map;
}

export function getSessionToken(req: {
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const cookieHeader = req.headers["cookie"];
  const cookieStr = Array.isArray(cookieHeader)
    ? cookieHeader[0]
    : cookieHeader;
  const cookies = parseCookies(cookieStr);
  return cookies.get(COOKIE_NAME) ?? null;
}

export { COOKIE_NAME };

// ─── Admin-Seed ───────────────────────────────────────────────────────────────
// Erstellt beim ersten Start einen Admin-Account und initialisiert Berechtigungen
export async function seedAdminIfNeeded() {
  try {
    await initDefaultPermissions();
    const allUsers = await getAllUsers();
    if (allUsers.length === 0) {
      const passwordHash = await hashPassword("Admin1234!");
      await createUser({
        email: "admin@hwp-portal.de",
        passwordHash,
        name: "Administrator",
        role: "admin",
        isActive: true,
      });
      console.log(
        "[Auth] Admin-Account erstellt: admin@hwp-portal.de / Admin1234!"
      );
    }
  } catch (error) {
    console.error("[Auth] Seed-Fehler:", error);
  }
}
