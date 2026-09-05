import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { projectSchema } from "../packages/contracts/scene";

// Only authenticated operators publish manually inspected, approved examples.
// Normal user lessons never appear here automatically.
export const unpublish = internalMutation({ args: { slug: v.string() }, returns: v.null(), handler: async (ctx, { slug }) => {
  const row = await ctx.db.query("showcase").withIndex("by_slug", q => q.eq("slug", slug)).unique();
  if (row) await ctx.db.delete(row._id);
  return null;
} });
export const publish = internalMutation({ args: { slug: v.string(), jobId: v.id("jobs"), revision: v.number(), description: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  if (!/^[a-z0-9-]{3,60}$/.test(args.slug) || args.description.length > 180) throw new Error("Invalid showcase entry");
  const review = await ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", args.jobId).eq("revision", args.revision)).unique();
  const version = await ctx.db.query("lessonVersions").withIndex("by_jobId_and_revision", q => q.eq("jobId", args.jobId).eq("revision", args.revision)).unique();
  if (review?.status !== "passed" || !version) throw new Error("Only an approved stored version can be published");
  const existing = await ctx.db.query("showcase").withIndex("by_slug", q => q.eq("slug", args.slug)).unique();
  if (existing) await ctx.db.patch(existing._id, args); else await ctx.db.insert("showcase", args);
  return null;
} });
export const list = query({ args: {}, returns: v.array(v.object({ slug: v.string(), title: v.string(), description: v.string(), poster: v.union(v.string(), v.null()) })), handler: async ctx => {
  const rows = await ctx.db.query("showcase").take(6);
  const result = [];
  for (const row of rows) {
    const version = await ctx.db.query("lessonVersions").withIndex("by_jobId_and_revision", q => q.eq("jobId", row.jobId).eq("revision", row.revision)).unique();
    const review = await ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", row.jobId).eq("revision", row.revision)).unique();
    if (version && review?.status === "passed") result.push({ slug: row.slug, title: projectSchema.parse(JSON.parse(version.projectJson)).title, description: row.description, poster: await ctx.storage.getUrl(version.result.poster) });
  }
  return result;
} });
export const get = query({ args: { slug: v.string() }, handler: async (ctx, { slug }) => {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const row = await ctx.db.query("showcase").withIndex("by_slug", q => q.eq("slug", slug)).unique();
  if (!row) return null;
  const review = await ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", row.jobId).eq("revision", row.revision)).unique();
  const version = await ctx.db.query("lessonVersions").withIndex("by_jobId_and_revision", q => q.eq("jobId", row.jobId).eq("revision", row.revision)).unique();
  if (review?.status !== "passed" || !version) return null;
  const project = projectSchema.parse(JSON.parse(version.projectJson));
  return { title: project.title, revision: row.revision, video: await ctx.storage.getUrl(version.result.video), captions: await ctx.storage.getUrl(version.result.captions), sources: project.sources };
} });
