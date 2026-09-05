import { z } from "zod";
import type { Doc } from "../_generated/dataModel";
import type { Project } from "../../packages/contracts/scene";
import { validateReview } from "../../packages/contracts/review";

export type ReviewContext = { job: Doc<"jobs">; task: Doc<"mediaTasks">; research: string; review: Doc<"lessonReviews"> };
// Bind checkpoints to the exact revision's immutable MP4/project/frame storage
// objects, requested script, complete research, and selected provider route.
export function reviewScope(current: Pick<ReviewContext, "job" | "task" | "research">): string {
  const result = current.task.result!;
  return JSON.stringify({ taskId: current.task._id, projectJson: current.task.projectJson, research: current.research, provider: current.job.generationProvider || "nim", video: result.video, project: result.project, durationSeconds: result.durationSeconds, frames: result.frames?.map(({ sceneId, frame, storageId }) => ({ sceneId, frame, storageId })).sort((a, b) => a.sceneId.localeCompare(b.sceneId) || a.frame - b.frame) });
}

const usage = z.object({ input_tokens: z.number().nonnegative().optional(), output_tokens: z.number().nonnegative().optional(), total_tokens: z.number().nonnegative().optional() }).strict();
const attempt = z.object({ provider: z.enum(["openai", "nvidia", "cloudflare"]), outcome: z.string().max(80), elapsedMs: z.number().nonnegative(), model: z.string().max(300).optional(), responseId: z.string().max(300).optional(), usage: usage.optional() }).strict();
export function validateFactCheckpoint(value: unknown, project: Project) {
  const record = z.object({ data: z.unknown(), attempts: z.array(attempt).min(1).max(8) }).strict().parse(value);
  const data = validateReview(record.data, project);
  if (data.scenes.some(scene => !scene.visualPass || scene.issues.some(issue => issue.kind !== "factual"))) throw new Error("Invalid factual review checkpoint");
  return { data, attempts: record.attempts };
}

export function validateCheckpointRoute(providers: string[], current: ReviewContext) {
  if (!providers.length || providers.some(provider => current.job.generationProvider === "openai" ? provider !== "openai" : !["nvidia", "cloudflare"].includes(provider))) throw new Error("Review checkpoint changed the selected provider route");
}
