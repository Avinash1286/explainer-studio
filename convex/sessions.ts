import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { hashToken } from "./lib/session";
import { LIMITS } from "../packages/contracts";
import { limits } from "./lib/limits";

export const start = mutation({
  args: { token: v.string() },
  returns: v.object({ expiresAt: v.number() }),
  handler: async (ctx, { token }) => {
    const tokenHash = await hashToken(token);
    const existing = await ctx.db.query("sessions").withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash)).unique();
    if (existing) return { expiresAt: existing.expiresAt };
    const expiresAt = Date.now() + LIMITS.sessionLifetimeMs;
    const allowance = await limits.limit(ctx, "sessions");
    if (!allowance.ok) throw new ConvexError("Workspace capacity is busy. Please try again shortly.");
    const sessionId = await ctx.db.insert("sessions", { tokenHash, expiresAt, expired: false });
    await ctx.scheduler.runAt(expiresAt, internal.sessions.expire, { sessionId });
    return { expiresAt };
  },
});

export const expire = internalMutation({
  args: { sessionId: v.id("sessions") }, returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (session && session.expiresAt <= Date.now()) await ctx.db.patch(sessionId, { expired: true });
    return null;
  },
});
