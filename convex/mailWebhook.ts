"use node";
import { Webhook } from "svix";
import { v } from "convex/values";
import { z } from "zod";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const receive = internalAction({ args: { body: v.string(), id: v.string(), timestamp: v.string(), signature: v.string() }, returns: v.number(), handler: async (ctx, args) => {
  if (!env.AGENTMAIL_WEBHOOK_SECRET) return 503;
  let payload: unknown;
  try {
    // Svix 2 verifies in place and returns void. Parse only after verification.
    await new Webhook(env.AGENTMAIL_WEBHOOK_SECRET).verify(args.body, { "svix-id": args.id, "svix-timestamp": args.timestamp, "svix-signature": args.signature });
    payload = JSON.parse(args.body);
  }
  catch { return 401; }
  const base = z.object({ event_type: z.string(), event_id: z.string().max(200) }).safeParse(payload);
  if (!base.success) return 400;
  const field = ({ "message.sent": "send", "message.delivered": "delivery", "message.bounced": "bounce" } as Record<string, string>)[base.data.event_type];
  if (!field) return 204;
  const detail = z.object({ message_id: z.string().min(1).max(500), inbox_id: z.string() }).safeParse((payload as Record<string, unknown>)[field]);
  if (!detail.success) return 400;
  if (detail.data.inbox_id !== env.AGENTMAIL_INBOX_ID) return 204;
  try { await ctx.runMutation(internal.delivery.event, { eventId: base.data.event_id, messageId: detail.data.message_id, state: base.data.event_type.slice(8) as "sent" | "delivered" | "bounced" }); }
  catch { return 503; }
  return 204;
} });
