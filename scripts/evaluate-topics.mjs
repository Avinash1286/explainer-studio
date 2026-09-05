import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// Uses ordinary public app operations. No admin credentials, operator recovery,
// automatic user edits, email, or manufactured approval results.
const { values } = parseArgs({ options: {
  deployment: { type: "string" }, topics: { type: "string", default: "docs/evaluation-topics.json" },
  out: { type: "string" }, indices: { type: "string" }, resume: { type: "boolean", default: false },
  minutes: { type: "string", default: "45" },
} });
if (!values.deployment || !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(values.deployment) || !values.out) {
  throw new Error("Pass --deployment https://YOUR.convex.cloud --out runs/NAME; optionally --indices 0,2,4 or --resume.");
}
const directory = path.resolve(values.out), root = path.resolve("runs");
if (!directory.startsWith(root + path.sep)) throw new Error("Evaluation output must be inside ignored runs/ (it contains a private creator token).");
const minutes = Number(values.minutes);
if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) throw new Error("Use --minutes between 1 and 120.");
fs.mkdirSync(directory, { recursive: true });
const stateFile = path.join(directory, "workspace.json");
const client = new ConvexHttpClient(values.deployment);
let state;
if (values.resume) {
  state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (state.deployment !== values.deployment) throw new Error("Resume deployment differs from saved workspace.");
} else {
  const topics = JSON.parse(fs.readFileSync(values.topics, "utf8"));
  const indices = values.indices ? values.indices.split(",").map(Number) : topics.map((_, i) => i);
  if (indices.length < 1 || indices.length > 5 || new Set(indices).size !== indices.length || indices.some(i => !Number.isInteger(i) || !topics[i])) throw new Error("Choose one to five unique topic indices.");
  const selected = indices.map(i => topics[i]);
  if (selected.some(t => typeof t.topic !== "string" || t.topic.length < 8 || t.topic.length > 500 || ![60, 75, 90].includes(t.duration))) throw new Error("Invalid topic or duration.");
  state = { deployment: values.deployment, codeCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(), startedAt: new Date().toISOString(), token: randomBytes(32).toString("hex"), jobs: selected.map(t => ({ ...t, requestId: randomUUID(), status: "not_started" })) };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { flag: "wx", mode: 0o600 });
}
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
await client.mutation(api.sessions.start, { token: state.token });
for (const job of state.jobs) {
  if (!job.jobId) {
    job.jobId = await client.mutation(api.jobs.create, { token: state.token, topic: job.topic, duration: job.duration, audience: "beginner", requestId: job.requestId });
    save();
  }
}
const terminal = new Set(["completed", "failed", "cancelled"]);
const deadline = Date.now() + minutes * 60_000;
while (Date.now() < deadline) {
  for (const job of state.jobs.filter(j => !j.started)) {
    try {
      await client.mutation(api.generation.generate, { token: state.token, jobId: job.jobId });
      job.started = true; save();
    } catch (error) {
      if (!String(error.message).includes("queue is full")) throw error;
    }
  }
  const rows = await client.query(api.jobs.list, { token: state.token });
  for (const job of state.jobs) {
    const row = rows.find(r => r._id === job.jobId);
    if (!row) throw new Error("Evaluation job missing from its workspace.");
    if (job.status !== row.status || job.revision !== row.revision) console.log(JSON.stringify({ topic: job.topic, status: row.status, revision: row.revision }));
    job.status = row.status; job.revision = row.revision; job.message = row.stageMessage;
    if (terminal.has(row.status) && (job.resultRevision !== row.revision || job.resultStatus !== row.status)) {
      job.result = await client.query(api.media.result, { token: state.token, jobId: job.jobId });
      job.review = await client.query(api.reviews.details, { token: state.token, jobId: job.jobId });
      job.resultRevision = row.revision;
      job.resultStatus = row.status;
      if (job.result?.project) {
        const response = await fetch(job.result.project, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error("Could not read rendered project artifact.");
        const project = await response.json();
        job.benchmark = project.benchmark;
        fs.writeFileSync(path.join(directory, `${job.jobId}-project.json`), JSON.stringify(project, null, 2));
      }
    }
  }
  save();
  const report = { codeCommit: state.codeCommit, startedAt: state.startedAt, checkedAt: new Date().toISOString(), deployment: state.deployment,
    completed: state.jobs.every(j => terminal.has(j.status)),
    note: "Automatic review results only. No operator recovery or requested scene edits. Manual quality inspection and real user trials are separate.",
    topics: state.jobs.map(j => ({ topic: j.topic, duration: j.duration, status: j.status, revision: j.revision, message: j.message,
      approved: j.status === "completed" && j.review?.reviews.some(r => r.revision === j.revision && r.status === "passed"), benchmark: j.benchmark,
      reviews: j.review?.reviews.map(r => ({ revision: r.revision, status: r.status, provider: r.provider, model: r.model, report: r.report })) })),
  };
  fs.writeFileSync(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
  if (report.completed) { console.log(`Finished: ${report.topics.filter(j => j.approved).length}/${state.jobs.length} automatically approved. Inspect report.json and the videos.`); break; }
  await sleep(20_000);
}
if (!state.jobs.every(j => terminal.has(j.status))) {
  console.error("Evaluation time limit reached. Jobs continue in Convex; rerun with --resume. No unfinished job is counted as a pass.");
  process.exitCode = 2;
}
