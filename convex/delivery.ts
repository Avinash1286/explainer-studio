import { ConvexError, v } from "convex/values";
import { start } from "@convex-dev/workflow";
import { env, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { workflow } from "./generation";
import { requireSession, hashToken } from "./lib/session";
import { limits } from "./lib/limits";
import schema from "./schema";
import { projectSchema } from "../packages/contracts/scene";

export const run = workflow.define({ args: { outboxId: v.id("mailOutbox") }, returns: v.null() }).handler(async (step, args): Promise<null> => {
  try { await step.runAction(internal.mailActions.send, args, { retry: { maxAttempts: 3, initialBackoffMs: 5000, base: 2 } }); }
  catch { await step.runMutation(internal.delivery.uncertain, args); }
  return null;
});
export const prepareVerification = internalMutation({ args: { token: v.string(), jobId: v.id("jobs"), email: v.string(), code: v.string(), consent: v.boolean() }, returns: v.null(), handler: async (ctx, args) => {
  const session = await requireSession(ctx, args.token, Date.now());
  const job = await ctx.db.get(args.jobId);
  if (!job || job.sessionId !== session._id) throw new ConvexError("Lesson not found");
  if (!args.consent) throw new ConvexError("Consent to the verification email is required");
  if (!env.AGENTMAIL_API_KEY || !env.AGENTMAIL_INBOX_ID || !env.AGENTMAIL_WEBHOOK_SECRET) throw new ConvexError("Email setup is pending");
  const email = args.email.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email)) throw new ConvexError("Enter a valid email address");
  const existing = await ctx.db.query("recipients").withIndex("by_jobId", q => q.eq("jobId", args.jobId)).unique();
  if (existing && existing.expiresAt > Date.now()) {
    if (existing.email !== email) throw new ConvexError("Use the current email or wait for its verification to expire");
    return null;
  }
  if (!(await limits.limit(ctx, "emailRequests", { key: session._id })).ok || !(await limits.limit(ctx, "emailRequests", { key: email })).ok || !(await limits.limit(ctx, "allEmailRequests")).ok) throw new ConvexError("Email request limit reached. Try again later");
  const codeHash = await hashToken(args.code);
  const expiresAt = Date.now() + 15 * 60_000;
  const fields = { jobId: args.jobId, email, codeHash, expiresAt, attempts: 0 };
  const recipientId = existing ? existing._id : await ctx.db.insert("recipients", fields);
  if (existing) await ctx.db.patch(existing._id, { ...fields, verifiedAt: undefined });
  await ctx.scheduler.runAt(expiresAt, internal.delivery.expireRecipient, { recipientId, expiresAt });
  const outboxId = await ctx.db.insert("mailOutbox", { jobId: args.jobId, key: `verify-${codeHash}`, inbox: env.AGENTMAIL_INBOX_ID, recipientId, kind: "verification", revision: job.revision, bodyJson: JSON.stringify({ to: [email], subject: "Verify your Explainer Studio email", text: `You requested email verification in Explainer Studio. Paste this code into the same browser workspace within 15 minutes:\n\n${args.code}\n\nThis does not subscribe you to messages. If you did not request it, ignore this email.`, track_opens: false, track_clicks: false }), state: "queued", createdAt: Date.now(), expiresAt, attempt: 0 });
  await start(ctx, internal.delivery.run, { outboxId }, { startAsync: true });
  await ctx.scheduler.runAt(expiresAt, internal.delivery.eraseVerification, { outboxId });
  return null;
} });
export const verify = mutation({ args: { token: v.string(), jobId: v.id("jobs"), code: v.string() }, returns: v.boolean(), handler: async (ctx, args) => {
  const session = await requireSession(ctx, args.token, Date.now());
  const job = await ctx.db.get(args.jobId);
  if (!job || job.sessionId !== session._id) throw new ConvexError("Lesson not found");
  const recipient = await ctx.db.query("recipients").withIndex("by_jobId", q => q.eq("jobId", args.jobId)).unique();
  if (!recipient || recipient.expiresAt <= Date.now() || recipient.attempts >= 5) return false;
  if (recipient.verifiedAt) return true;
  const valid = /^[a-f0-9]{64}$/.test(args.code) && await hashToken(args.code) === recipient.codeHash;
  // Return false instead of throwing, so a wrong attempt is durably counted.
  await ctx.db.patch(recipient._id, { attempts: recipient.attempts + 1, ...(valid ? { verifiedAt: Date.now(), expiresAt: Date.now() + 7 * 86400_000 } : {}) });
  if (valid) await ctx.scheduler.runAt(Date.now() + 7 * 86400_000, internal.delivery.expireRecipient, { recipientId: recipient._id, expiresAt: Date.now() + 7 * 86400_000 });
  return valid;
} });
export const prepareLesson = internalMutation({ args: { token: v.string(), jobId: v.id("jobs"), revision: v.number(), shareToken: v.string(), consent: v.boolean() }, returns: v.null(), handler: async (ctx, args) => {
  const session = await requireSession(ctx, args.token, Date.now());
  const job = await ctx.db.get(args.jobId);
  if (!job || job.sessionId !== session._id) throw new ConvexError("Lesson not found");
  if (!args.consent) throw new ConvexError("Consent to send this lesson and its share link is required");
  const recipient = await ctx.db.query("recipients").withIndex("by_jobId", q => q.eq("jobId", args.jobId)).unique();
  if (!recipient?.verifiedAt || recipient.expiresAt <= Date.now()) throw new ConvexError("Verify your email first");
  const key = `lesson-${job._id}-${args.revision}-${recipient._id}`;
  if (await ctx.db.query("mailOutbox").withIndex("by_key", q => q.eq("key", key)).unique()) return null;
  const review = await ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", job._id).eq("revision", args.revision)).unique();
  const version = await ctx.db.query("lessonVersions").withIndex("by_jobId_and_revision", q => q.eq("jobId", job._id).eq("revision", args.revision)).unique();
  if (job.revision !== args.revision || job.status !== "completed" || review?.status !== "passed" || !version) throw new ConvexError("Only a reviewed, completed lesson can be emailed");
  if (!env.AGENTMAIL_API_KEY || !env.AGENTMAIL_INBOX_ID || !env.AGENTMAIL_WEBHOOK_SECRET) throw new ConvexError("Email setup is pending");
  const shareExpires = Date.now() + 7 * 86400_000;
  const shareId = await ctx.db.insert("lessonShares", { jobId: job._id, revision: args.revision, tokenHash: await hashToken(args.shareToken), expiresAt: shareExpires });
  await ctx.scheduler.runAt(shareExpires, internal.delivery.expireShare, { shareId });
  const project = projectSchema.parse(JSON.parse(version.projectJson));
  // Convex static hosting uses SPA fallback for extensionless paths. Resolve
  // the exported page explicitly so an email opens the shared lesson, not `/`.
  const link = `${env.CONVEX_SITE_URL}/lesson/index.html?share=${args.shareToken}`;
  const outboxId = await ctx.db.insert("mailOutbox", { jobId: job._id, key, inbox: env.AGENTMAIL_INBOX_ID, recipientId: recipient._id, kind: "lesson", revision: args.revision, bodyJson: JSON.stringify({ to: [recipient.email], subject: "Your Explainer Studio lesson is ready", text: `${project.title}\n\nWatch revision ${args.revision}: ${link}\n\nAnyone with this link can watch for seven days. The lesson passed automated source and sampled-frame review; this is not a guarantee of accuracy.\n\nSources:\n${project.sources.map(s => `${s.title}: ${s.url}`).join("\n")}\n\nOpenMoji illustrations: CC BY-SA 4.0, animated adaptations.`, track_opens: false, track_clicks: false }), state: "queued", createdAt: Date.now(), expiresAt: Date.now() + 3600_000, attempt: 0 });
  await start(ctx, internal.delivery.run, { outboxId }, { startAsync: true });
  return null;
} });
export const claim = internalMutation({ args: { outboxId: v.id("mailOutbox") }, returns: v.union(v.null(), schema.doc("mailOutbox")), handler: async (ctx, { outboxId }) => {
  const item = await ctx.db.get(outboxId);
  if (!item || !["queued", "sending"].includes(item.state)) return null;
  if (item.expiresAt <= Date.now() || item.attempt >= 3) { await ctx.db.patch(outboxId, { state: item.attempt ? "unknown" : "failed" }); return null; }
  const job = await ctx.db.get(item.jobId);
  const recipient = await ctx.db.get(item.recipientId);
  if (!job || job.status === "cancelled" || !recipient || recipient.expiresAt <= Date.now() || (item.kind === "lesson" && !recipient.verifiedAt) || (item.kind === "verification" && item.key !== `verify-${recipient.codeHash}`)) { await ctx.db.patch(outboxId, { state: "failed" }); return null; }
  await ctx.db.patch(outboxId, { state: "sending", attempt: item.attempt + 1 });
  return item;
} });
export const sent = internalMutation({ args: { outboxId: v.id("mailOutbox"), messageId: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const item = await ctx.db.get(args.outboxId);
  if (item && ["sending", "unknown"].includes(item.state)) await ctx.db.patch(item._id, { state: "sent", messageId: args.messageId });
  return null;
} });
export const uncertain = internalMutation({ args: { outboxId: v.id("mailOutbox") }, returns: v.null(), handler: async (ctx, { outboxId }) => {
  const item = await ctx.db.get(outboxId);
  if (item && ["queued", "sending"].includes(item.state)) await ctx.db.patch(outboxId, { state: "unknown" });
  return null;
} });
export const eraseVerification = internalMutation({ args: { outboxId: v.id("mailOutbox") }, returns: v.null(), handler: async (ctx, { outboxId }) => {
  const item = await ctx.db.get(outboxId);
  if (item?.kind === "verification") await ctx.db.patch(outboxId, { bodyJson: "{}", ...(["queued", "sending"].includes(item.state) ? { state: "unknown" as const } : {}) });
  return null;
} });
export const expireRecipient = internalMutation({ args: { recipientId: v.id("recipients"), expiresAt: v.number() }, returns: v.null(), handler: async (ctx, args) => {
  const recipient = await ctx.db.get(args.recipientId);
  if (recipient?.expiresAt === args.expiresAt && recipient.expiresAt <= Date.now()) await ctx.db.patch(recipient._id, { expiresAt: 0, verifiedAt: undefined });
  return null;
} });
export const expireShare = internalMutation({ args: { shareId: v.id("lessonShares") }, returns: v.null(), handler: async (ctx, { shareId }) => {
  const share = await ctx.db.get(shareId);
  if (share && share.expiresAt <= Date.now()) await ctx.db.delete(shareId);
  return null;
} });
export const event = internalMutation({ args: { eventId: v.string(), messageId: v.string(), state: v.union(v.literal("sent"), v.literal("delivered"), v.literal("bounced")) }, returns: v.null(), handler: async (ctx, args) => {
  if (await ctx.db.query("mailEvents").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).unique()) return null;
  const item = await ctx.db.query("mailOutbox").withIndex("by_messageId", q => q.eq("messageId", args.messageId)).unique();
  // A callback can arrive before the send acknowledgement. Retry it rather than
  // recording an event that cannot yet be associated with its outbox record.
  if (!item) throw new Error("Send acknowledgement is not available yet");
  await ctx.db.insert("mailEvents", { eventId: args.eventId, createdAt: Date.now() });
  if (item.state !== "bounced" && (args.state === "bounced" || item.state !== "delivered")) await ctx.db.patch(item._id, { state: args.state });
  return null;
} });
export const status = query({ args: { token: v.string(), jobId: v.id("jobs") }, returns: v.union(v.null(), v.object({ enabled: v.boolean(), email: v.union(v.string(), v.null()), verified: v.boolean(), messages: v.array(v.object({ kind: v.string(), revision: v.number(), state: v.string() })) })), handler: async (ctx, args) => {
  const session = await requireSession(ctx, args.token);
  const job = await ctx.db.get(args.jobId);
  if (!job || job.sessionId !== session._id) return null;
  const recipient = await ctx.db.query("recipients").withIndex("by_jobId", q => q.eq("jobId", args.jobId)).unique();
  const messages = await ctx.db.query("mailOutbox").withIndex("by_jobId", q => q.eq("jobId", args.jobId)).order("desc").take(10);
  return { enabled: Boolean(env.AGENTMAIL_API_KEY && env.AGENTMAIL_INBOX_ID && env.AGENTMAIL_WEBHOOK_SECRET), email: recipient?.email || null, verified: Boolean(recipient?.verifiedAt), messages: messages.map(({ kind, revision, state }) => ({ kind, revision, state })) };
} });
export const shared = query({ args: { token: v.string() }, returns: v.union(v.null(), v.object({ title: v.string(), revision: v.number(), video: v.union(v.string(), v.null()), captions: v.union(v.string(), v.null()), sources: v.array(v.object({ title: v.string(), url: v.string() })) })), handler: async (ctx, { token }) => {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await hashToken(token);
  const share = await ctx.db.query("lessonShares").withIndex("by_tokenHash", q => q.eq("tokenHash", tokenHash)).unique();
  if (!share || share.expiresAt <= Date.now()) return null;
  const job = await ctx.db.get(share.jobId);
  const review = await ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", share.jobId).eq("revision", share.revision)).unique();
  const version = await ctx.db.query("lessonVersions").withIndex("by_jobId_and_revision", q => q.eq("jobId", share.jobId).eq("revision", share.revision)).unique();
  if (!job || job.status === "cancelled" || review?.status !== "passed" || !version) return null;
  const project = projectSchema.parse(JSON.parse(version.projectJson));
  return { title: project.title, revision: share.revision, video: await ctx.storage.getUrl(version.result.video), captions: await ctx.storage.getUrl(version.result.captions), sources: project.sources };
} });
