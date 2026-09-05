/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workflow from "@convex-dev/workflow/test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { testDraft, testSources } from "../convex/testFixtures";
import { projectSchema } from "../packages/contracts/scene";
import { frameSamples, type Review } from "../packages/contracts/review";
import manifest from "../public/openmoji/manifest.json";
export const owner = "a".repeat(64);
const modules = import.meta.glob(["../convex/**/*.ts", "!../convex/**/*.test.ts"]);
export const sampleProject = projectSchema.parse({ version: 1, id: "test-review", title: testDraft.title, targetDuration: 60, origin: "generated", voice: "af_heart", speed: 0.9, sources: testSources.map(({ title, url }) => ({ title, url })), scenes: testDraft.scenes.map(s => ({ ...s, nodes: s.nodes.map(n => ({ icon: manifest.entries.find(e => e.name === n.concept)!.id, label: n.label, cue: n.cue })) })) });
export const goodReview = (): Review => ({ summary: "Synthetic passing review", scenes: sampleProject.scenes.map(s => ({ sceneId: s.id, factualPass: true, visualPass: true, issues: [] })) });
export async function reviewSetup() {
  const t = convexTest(schema, modules); rateLimiter.register(t); workflow.register(t);
  await t.mutation(api.sessions.start, { token: owner });
  const jobId = await t.mutation(api.jobs.create, { token: owner, topic: "How does water move?", duration: 60, audience: "beginner", requestId: "review-request-0001" });
  await t.run(async ctx => {
    await ctx.db.patch(jobId, { generation: true, status: "rendering" });
    await ctx.db.insert("generationArtifacts", { jobId, stage: "research", json: JSON.stringify({ sources: testSources }), createdAt: Date.now() });
    await ctx.db.insert("mediaTasks", { jobId, fixtureVersion: "generated-v1", projectJson: JSON.stringify(sampleProject), provenanceJson: "{}", status: "queued", attempt: 0, leaseUntil: 0, createdAt: Date.now() });
  });
  const task = (await t.mutation(internal.media.claim, { worker: "worker", protocol: 3 }))!;
  const lease = { taskId: task.taskId, attempt: task.attempt, worker: "worker" };
  const scenes = sampleProject.scenes.map((s, i) => ({ ...s, startFrame: i * 360, durationInFrames: 360 }));
  async function store(type: string, value: string) {
    const id = await t.run(ctx => ctx.storage.store(new Blob([value], { type })));
    await t.run(ctx => (ctx.db as unknown as { patch(id: string, value: { contentType: string }): Promise<void> }).patch(id, { contentType: type }));
    await t.mutation(internal.media.registerUpload, { ...lease, storageId: id });
    return id;
  }
  const frames = [];
  for (const sample of frameSamples(scenes)) frames.push({ ...sample, storageId: await store("image/jpeg", "synthetic frame") });
  const result = { video: await store("video/mp4", "mock video"), project: await store("application/json", JSON.stringify({ ...sampleProject, scenes })), captions: await store("text/vtt", "WEBVTT"), poster: await store("image/png", "png"), durationSeconds: 60, frames };
  return { t, jobId, lease, result };
}
