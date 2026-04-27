import type { User } from "../../drizzle/schema";
import { ENV } from "./env";

export function isLoginDisabled() {
  return ENV.disableLogin;
}

export function createBypassUser(): User {
  const now = new Date();

  return {
    id: 1,
    email: "render@hwp-portal.local",
    passwordHash: "",
    name: "Render Admin",
    role: "admin",
    airtableAccountId: null,
    companyName: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: null,
  };
}

export function toSafeUser(user: User) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}