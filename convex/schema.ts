import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const reviewFrame = v.object({ sceneId: v.string(), frame: v.number(), storageId: v.id("_storage") });
export const mediaResult = v.object({ video: v.id("_storage"), project: v.id("_storage"), captions: v.id("_storage"), poster: v.id("_storage"), durationSeconds: v.number(), frames: v.optional(v.array(reviewFrame)) });

export const jobStatus = v.union(
  v.literal("queued"), v.literal("researching"), v.literal("planning"),
  v.literal("rendering"), v.literal("reviewing"), v.literal("completed"),
  v.literal("cancelled"), v.literal("failed"),
);

export default defineSchema({
  showcase: defineTable({ slug: v.string(), jobId: v.id("jobs"), revision: v.number(), description: v.string() }).index("by_slug", ["slug"]),
  sessions: defineTable({
    tokenHash: v.string(), expiresAt: v.number(), expired: v.boolean(),
  }).index("by_tokenHash", ["tokenHash"]),
  jobs: defineTable({
    sessionId: v.id("sessions"), topic: v.string(),
    duration: v.number(), audience: v.union(v.literal("beginner"), v.literal("student")),
    status: jobStatus, stageMessage: v.string(), revision: v.number(),
    requestId: v.string(), createdAt: v.number(), updatedAt: v.number(),
    workflowId: v.optional(v.string()), generation: v.optional(v.boolean()),
    automaticRepairs: v.optional(v.number()), userRevisions: v.optional(v.number()),
    planningRetries: v.optional(v.number()),
    reviewRetries: v.optional(v.number()),
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
  mediaTasks: defineTable({
    jobId: v.id("jobs"), fixtureVersion: v.string(),
    projectJson: v.optional(v.string()), provenanceJson: v.optional(v.string()),
    revision: v.optional(v.number()), attemptBase: v.optional(v.number()),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("failed"), v.literal("cancelled")),
    attempt: v.number(), worker: v.optional(v.string()), leaseUntil: v.number(), createdAt: v.number(),
    result: v.optional(mediaResult),
  }).index("by_jobId", ["jobId"]).index("by_status_and_leaseUntil", ["status", "leaseUntil"]),
  mediaUploads: defineTable({ taskId: v.id("mediaTasks"), attempt: v.number(), storageId: v.id("_storage"), createdAt: v.number(), committed: v.boolean() }).index("by_taskId_and_attempt", ["taskId", "attempt"]),
  generationArtifacts: defineTable({ jobId: v.id("jobs"), stage: v.string(), json: v.string(), createdAt: v.number() }).index("by_jobId_and_stage", ["jobId", "stage"]),
  iconEmbeddings: defineTable({ iconId: v.string(), name: v.string(), space: v.string(), embedding: v.array(v.float64()) })
    .index("by_space_and_iconId", ["space", "iconId"])
    .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 768, filterFields: ["space"] }),
  providerQualification: defineTable({ key: v.string(), passed: v.boolean(), reportJson: v.string(), updatedAt: v.number() }).index("by_key", ["key"]),
  lessonReviews: defineTable({ jobId: v.id("jobs"), revision: v.number(), status: v.union(v.literal("pending"), v.literal("passed"), v.literal("rejected"), v.literal("unavailable")), reportJson: v.optional(v.string()), provider: v.optional(v.union(v.literal("cloudflare"), v.literal("nvidia"))), model: v.optional(v.string()), responseId: v.optional(v.string()), usageJson: v.optional(v.string()), createdAt: v.number() }).index("by_jobId_and_revision", ["jobId", "revision"]),
  lessonVersions: defineTable({ jobId: v.id("jobs"), revision: v.number(), projectJson: v.string(), provenanceJson: v.string(), result: mediaResult, createdAt: v.number() }).index("by_jobId_and_revision", ["jobId", "revision"]),
  revisionRequests: defineTable({ jobId: v.id("jobs"), fromRevision: v.number(), requestId: v.string(), sceneIds: v.array(v.string()), instruction: v.string(), status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")), automatic: v.boolean(), recoveryAttempted: v.optional(v.boolean()), attemptsJson: v.optional(v.string()) }).index("by_jobId_and_requestId", ["jobId", "requestId"]),
  recipients: defineTable({ jobId: v.id("jobs"), email: v.string(), codeHash: v.string(), expiresAt: v.number(), attempts: v.number(), verifiedAt: v.optional(v.number()) }).index("by_jobId", ["jobId"]),
  mailOutbox: defineTable({ jobId: v.id("jobs"), key: v.string(), inbox: v.string(), recipientId: v.id("recipients"), kind: v.union(v.literal("verification"), v.literal("lesson")), revision: v.number(), bodyJson: v.string(), state: v.union(v.literal("queued"), v.literal("sending"), v.literal("sent"), v.literal("delivered"), v.literal("bounced"), v.literal("failed"), v.literal("unknown")), messageId: v.optional(v.string()), createdAt: v.number(), expiresAt: v.number(), attempt: v.number() }).index("by_key", ["key"]).index("by_messageId", ["messageId"]).index("by_jobId", ["jobId"]),
  mailEvents: defineTable({ eventId: v.string(), createdAt: v.number() }).index("by_eventId", ["eventId"]),
  lessonShares: defineTable({ jobId: v.id("jobs"), revision: v.number(), tokenHash: v.string(), expiresAt: v.number() }).index("by_tokenHash", ["tokenHash"]).index("by_jobId", ["jobId"]),
});
