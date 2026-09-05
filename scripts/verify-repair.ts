import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { projectSchema } from "../packages/contracts/scene";
import { researchSchema } from "../packages/contracts/generation";
import { validateReview, passedReview } from "../packages/contracts/review";
import { repairInput, repairScenes } from "../convex/lib/repair";
import { inspectFrames } from "../convex/lib/critic";
import { renderProject } from "../workers/media/render";
import { ProviderError } from "../convex/lib/providers";

const [projectPath, sourcesPath, reviewPath, outputPath] = process.argv.slice(2).filter(arg => arg !== "--resume");
if (!projectPath || !sourcesPath || !reviewPath || !outputPath) throw new Error("Usage: npm run repair:verify -- project.json sources.json review.json output-directory [--resume]");
const previous = projectSchema.parse(JSON.parse(await readFile(projectPath, "utf8")));
const sources = researchSchema.parse(JSON.parse(await readFile(sourcesPath, "utf8")));
const originalReview = validateReview(JSON.parse(await readFile(reviewPath, "utf8")), previous);
const sceneIds = originalReview.scenes.filter(s => !s.factualPass || !s.visualPass).map(s => s.sceneId);
const instruction = JSON.stringify(originalReview);
const config = { NVIDIA_API_KEY: process.env.NVIDIA_API_KEY, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN };
const input = repairInput(previous, sources, sceneIds, instruction);
const inputHash = createHash("sha256").update(JSON.stringify({ previous, sources, originalReview })).digest("hex");
const directory = path.resolve(outputPath);
await mkdir(directory, { recursive: true });
const checkpointPath = path.join(directory, "repair-checkpoint.json");
let result: Awaited<ReturnType<typeof repairScenes>>;
if (process.argv.includes("--resume")) {
  const saved = JSON.parse(await readFile(checkpointPath, "utf8"));
  if (saved.inputHash !== inputHash) throw new Error("Repair checkpoint belongs to different inputs");
  const project = projectSchema.parse(saved.result.data.project);
  // Revalidate scope, narration, icon guards and source identities before using
  // a paid-call checkpoint. A cached result is never an approval.
  const checked = input.validate({ scenes: project.scenes.filter(s => sceneIds.includes(s.id)).map(s => ({ ...s,
    evidenceIds: saved.result.data.evidence.find((item: { sceneId: string }) => item.sceneId === s.id)?.evidence.map((item: { sourceId: string; quote: string }) => input.evidence.find(e => e.sourceId === item.sourceId && e.quote === item.quote)?.id),
  })) });
  if (JSON.stringify(project) !== JSON.stringify(checked.project)) throw new Error("Cached project changed an unaffected scene or project metadata");
  result = { data: checked, attempts: saved.result.attempts };
} else {
  result = await repairScenes(config, previous, sources, sceneIds, instruction);
  await writeFile(checkpointPath, JSON.stringify({ inputHash, result }, null, 2));
}
const rendered = await renderProject(result.data.project, directory, async message => { console.log(message); }, undefined, { kind: "repair-verification", inputHash, attempts: result.attempts, evidence: result.data.evidence });
const frames = [];
for (const [i, sample] of rendered.frames.entries()) frames.push({ ...sample, url: `data:image/jpeg;base64,${(await readFile(path.join(directory, `review-${i}.jpg`))).toString("base64")}` });
const verification = { checkedAt: new Date().toISOString(), inputHash, reusedRepair: process.argv.includes("--resume"), changedSceneIds: sceneIds, attempts: result.attempts, benchmark: rendered.benchmark };
let reviewed: Awaited<ReturnType<typeof inspectFrames>>;
try {
  reviewed = await inspectFrames(config, result.data.project, sources, frames);
} catch (error) {
  // Preserve the actual render and its failure evidence. Unavailable review
  // never counts as approval, and reruns remain an explicit operator choice.
  const failure = error instanceof ProviderError ? { provider: error.provider, status: error.status } : { message: "Review response unavailable or invalid" };
  await writeFile(path.join(directory, "evaluation.json"), JSON.stringify({ ...verification, passed: false, reviewStatus: "unavailable", failure }, null, 2));
  throw error;
}
const report = validateReview(JSON.parse(reviewed.reportJson), result.data.project);
const evaluation = { ...verification, reviewStatus: passedReview(report) ? "passed" : "rejected", critic: { provider: reviewed.provider, model: reviewed.model, usage: JSON.parse(reviewed.usageJson) }, report, passed: passedReview(report) };
await writeFile(path.join(directory, "evaluation.json"), JSON.stringify(evaluation, null, 2));
console.log(JSON.stringify({ passed: evaluation.passed, output: directory, changedSceneIds: sceneIds, attempts: result.attempts, videoSha256: rendered.benchmark.videoSha256 }));
if (!evaluation.passed) process.exitCode = 2;
