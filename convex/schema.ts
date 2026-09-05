import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const jobStatus = v.union(
  v.literal("queued"), v.literal("researching"), v.literal("planning"),
  v.literal("rendering"), v.literal("reviewing"), v.literal("completed"),
  v.literal("cancelled"), v.literal("failed"),
);

export default defineSchema({
  sessions: defineTable({
    tokenHash: v.string(), expiresAt: v.number(), expired: v.boolean(),
  }).index("by_tokenHash", ["tokenHash"]),
  jobs: defineTable({
    sessionId: v.id("sessions"), topic: v.string(),
    duration: v.number(), audience: v.union(v.literal("beginner"), v.literal("student")),
    status: jobStatus, stageMessage: v.string(), revision: v.number(),
    requestId: v.string(), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_sessionId_and_createdAt", ["sessionId", "createdAt"])
    .index("by_sessionId_and_requestId", ["sessionId", "requestId"])
    .index("by_status", ["status"]),
  jobEvents: defineTable({
    jobId: v.id("jobs"), kind: v.string(), message: v.string(), createdAt: v.number(),
  }).index("by_jobId", ["jobId"]),
  workers: defineTable({
    workerId: v.string(), instanceId: v.string(), lastHeartbeat: v.number(),
    capabilities: v.array(v.string()), version: v.string(),
  }).index("by_workerId", ["workerId"]),
});
