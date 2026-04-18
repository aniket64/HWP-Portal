import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserById } from "../db";
import { COOKIE_NAME, parseCookies, verifyJWT } from "../auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    let token: string | undefined;

    // 1. Primär: Authorization: Bearer <token> Header (zuverlässig in allen Umgebungen)
    const authHeader = opts.req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }

    // 2. Fallback: Cookie (für Server-Side oder direkte API-Aufrufe)
    if (!token) {
      const cookieHeader = opts.req.headers["cookie"];
      const cookieStr = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
      const cookies = parseCookies(cookieStr);
      token = cookies.get(COOKIE_NAME);
    }

    if (token) {
      const payload = await verifyJWT(token);
      if (payload) {
        user = (await getUserById(payload.userId)) ?? null;
      }
    }
  } catch (error) {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
