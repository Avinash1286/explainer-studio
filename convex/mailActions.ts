"use node";
import { randomBytes } from "node:crypto";
import { v } from "convex/values";
import { z } from "zod";
import { action, internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";

export const requestVerification = action({ args: { token: v.string(), jobId: v.id("jobs"), email: v.string(), consent: v.boolean() }, returns: v.null(), handler: async (ctx, args) => {
  await ctx.runMutation(internal.delivery.prepareVerification, { ...args, code: randomBytes(32).toString("hex") });
  return null;
} });
export const sendLesson = action({ args: { token: v.string(), jobId: v.id("jobs"), revision: v.number(), consent: v.boolean() }, returns: v.null(), handler: async (ctx, args) => {
  await ctx.runMutation(internal.delivery.prepareLesson, { ...args, shareToken: randomBytes(32).toString("hex") });
  return null;
} });
export const send = internalAction({ args: { outboxId: v.id("mailOutbox") }, returns: v.null(), handler: async (ctx, args) => {
  const item = await ctx.runMutation(internal.delivery.claim, args);
  if (!item) return null;
  if (!env.AGENTMAIL_API_KEY) throw new Error("AgentMail is not configured");
  const response = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(item.inbox)}/messages/send`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${env.AGENTMAIL_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": item.key }, body: item.bodyJson });
  if (!response.ok) throw new Error(`AgentMail HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 20_000) throw new Error("Invalid AgentMail response");
  const data = z.object({ message_id: z.string().min(1).max(500) }).parse(JSON.parse(text));
  await ctx.runMutation(internal.delivery.sent, { ...args, messageId: data.message_id });
  return null;
} });
