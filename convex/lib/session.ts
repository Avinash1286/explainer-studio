import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";

export async function hashToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ConvexError("Invalid session. Reload to start a new session.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function requireSession(ctx: QueryCtx, token: string, now?: number) {
  const hash = await hashToken(token);
  const session = await ctx.db.query("sessions").withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash)).unique();
  if (!session || session.expired || (now !== undefined && session.expiresAt <= now)) throw new ConvexError("Session expired. Start a new session.");
  return session;
}
