/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { LIMITS } from "../packages/contracts";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
function backend() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}
const tokenA = "a".repeat(64);
const tokenB = "b".repeat(64);
const brief = { topic: "Why do leaves change color?", duration: 75, audience: "beginner" as const, requestId: "request-0000000001" };
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("private lesson briefs", () => {
  it("saves normalized input and returns only safe job fields", async () => {
    const t = backend();
    await t.mutation(api.sessions.start, { token: tokenA });
    const id = await t.mutation(api.jobs.create, { ...brief, topic: "  Why do leaves   change color?  ", token: tokenA });
    const jobs = await t.query(api.jobs.list, { token: tokenA });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ _id: id, topic: brief.topic, status: "queued", duration: 75 });
    expect(jobs[0]).not.toHaveProperty("sessionId");
    expect(jobs[0]).not.toHaveProperty("tokenHash");
  });

  it("isolates browser workspaces and rejects another owner's cancellation", async () => {
    const t = backend();
    await t.mutation(api.sessions.start, { token: tokenA });
    await t.mutation(api.sessions.start, { token: tokenB });
    const id = await t.mutation(api.jobs.create, { ...brief, token: tokenA });
    expect(await t.query(api.jobs.list, { token: tokenB })).toEqual([]);
    await expect(t.mutation(api.jobs.cancel, { token: tokenB, jobId: id })).rejects.toThrow("Lesson not found");
    expect((await t.query(api.jobs.list, { token: tokenA }))[0].status).toBe("queued");
  });

  it("rejects missing and malformed credentials", async () => {
    const t = backend();
    await expect(t.query(api.jobs.list, { token: tokenA })).rejects.toThrow("Session expired");
    await expect(t.mutation(api.sessions.start, { token: "guessable" })).rejects.toThrow("Invalid session");
  });

  it("deduplicates uncertain retries and rejects changed payloads with the same ID", async () => {
    const t = backend();
    await t.mutation(api.sessions.start, { token: tokenA });
    const first = await t.mutation(api.jobs.create, { ...brief, token: tokenA });
    const second = await t.mutation(api.jobs.create, { ...brief, token: tokenA });
    expect(second).toBe(first);
    expect(await t.query(api.jobs.list, { token: tokenA })).toHaveLength(1);
    await expect(t.mutation(api.jobs.create, { ...brief, duration: 90, token: tokenA })).rejects.toThrow("different lesson");
  });

  it("rejects invalid topic length and unsupported durations without consuming quota", async () => {
    const t = backend();
    await t.mutation(api.sessions.start, { token: tokenA });
    for (const topic of ["why", "a".repeat(501)]) await expect(t.mutation(api.jobs.create, { ...brief, topic, token: tokenA })).rejects.toThrow("characters");
    await expect(t.mutation(api.jobs.create, { ...brief, duration: 180, token: tokenA })).rejects.toThrow("60, 75, or 90");
    expect(await t.query(api.jobs.list, { token: tokenA })).toHaveLength(0);
  });

  it("makes cancellation idempotent", async () => {
    const t = backend();
    await t.mutation(api.sessions.start, { token: tokenA });
    const jobId = await t.mutation(api.jobs.create, { ...brief, token: tokenA });
    await t.mutation(api.jobs.cancel, { token: tokenA, jobId });
    await t.mutation(api.jobs.cancel, { token: tokenA, jobId });
    expect((await t.query(api.jobs.list, { token: tokenA }))[0].status).toBe("cancelled");
    const events = await t.run((ctx) => ctx.db.query("jobEvents").withIndex("by_jobId", (q) => q.eq("jobId", jobId)).take(10));
    expect(events.filter((event) => event.kind === "cancelled")).toHaveLength(1);
  });

  it("keeps day quotas after cancellation and does not count retries twice", async () => {
    const t = backend();
    await t.mutation(api.sessions.start, { token: tokenA });
    for (let i = 0; i < LIMITS.jobsPerSessionPerDay; i++) {
      const args = { ...brief, token: tokenA, requestId: `quota-request-${i.toString().padStart(5, "0")}` };
      const jobId = await t.mutation(api.jobs.create, args);
      expect(await t.mutation(api.jobs.create, args)).toBe(jobId);
      await t.mutation(api.jobs.cancel, { token: tokenA, jobId });
    }
    await expect(t.mutation(api.jobs.create, { ...brief, token: tokenA })).rejects.toThrow("daily lesson limit");
  });

  it("bounds the shared queue across distinct sessions", async () => {
    const t = backend();
    for (let person = 0; person < 4; person++) {
      const token = (person + 1).toString(16).repeat(64);
      await t.mutation(api.sessions.start, { token });
      for (let job = 0; job < 5; job++) await t.mutation(api.jobs.create, { ...brief, token, requestId: `queue-request-${job.toString().padStart(5, "0")}` });
    }
    await t.mutation(api.sessions.start, { token: tokenA });
    await expect(t.mutation(api.jobs.create, { ...brief, token: tokenA })).rejects.toThrow("queue is full");
  });

  it("expires sessions by a mutation that invalidates subscribed reads", async () => {
    const t = backend();
    await t.mutation(api.sessions.start, { token: tokenA });
    const session = await t.run((ctx) => ctx.db.query("sessions").first());
    await t.run((ctx) => ctx.db.patch(session!._id, { expiresAt: 0 }));
    await t.mutation(internal.sessions.expire, { sessionId: session!._id });
    await expect(t.query(api.jobs.list, { token: tokenA })).rejects.toThrow("Session expired");
  });
});

describe("worker HTTP boundary", () => {
    it("distinguishes fixture rendering from free-text generation", async () => {
    const response = await backend().fetch("/health");
    expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ generationEnabled: false, phase: "review-and-delivery", fixtureGenerationEnabled: true });
  });

  it("fails closed when worker configuration is missing", async () => {
    vi.stubEnv("WORKER_AUTH_TOKEN", "");
    const response = await backend().fetch("/worker/heartbeat", { method: "POST", body: "{}" });
    expect(response.status).toBe(503);
  });

  it("rejects unauthorized or malformed heartbeats, and stores an authorized heartbeat", async () => {
    const t = backend();
    vi.stubEnv("WORKER_AUTH_TOKEN", "c".repeat(64));
    const body = JSON.stringify({ workerId: "worker-1", instanceId: "instance-1", version: "0.1.0", capabilities: ["heartbeat"] });
    const headers = { Authorization: `Bearer ${"c".repeat(64)}`, "Content-Type": "application/json" };
    expect((await t.fetch("/worker/heartbeat", { method: "POST", body })).status).toBe(401);
    expect((await t.fetch("/worker/heartbeat", { method: "POST", headers, body: "not-json" })).status).toBe(400);
    expect((await t.fetch("/worker/heartbeat", { method: "POST", headers, body: JSON.stringify({ workerId: 5 }) })).status).toBe(400);
    expect((await t.fetch("/worker/heartbeat", { method: "POST", headers, body })).status).toBe(200);
    const workers = await t.run((ctx) => ctx.db.query("workers").take(10));
    expect(workers).toHaveLength(1);
    expect(workers[0].capabilities).toEqual(["heartbeat"]);
    const capabilities = ["kokoro", "remotion", "fixture-v1", "generated-v1", "review-frames-v1", "explicit-connections-v1", "text-cards-v1"];
    expect((await t.fetch("/worker/heartbeat", { method: "POST", headers, body: JSON.stringify({ ...JSON.parse(body), capabilities }) })).status).toBe(200);
    expect((await t.fetch("/worker/heartbeat", { method: "POST", headers, body: JSON.stringify({ ...JSON.parse(body), capabilities: Array(9).fill("too-many") }) })).status).toBe(400);
  });
});
