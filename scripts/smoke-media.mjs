import { ConvexHttpClient } from "convex/browser";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

if (!process.env.NEXT_PUBLIC_CONVEX_URL) throw new Error("Set NEXT_PUBLIC_CONVEX_URL to the test deployment");
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
const token = randomBytes(32).toString("hex");
await client.mutation("sessions:start", { token });
const jobId = await client.mutation("media:createSample", { token, requestId: randomUUID() });
let previous = "";
for (let i=0; i<120; i++) {
  const jobs = await client.query("jobs:list", { token });
  const job = jobs.find(j => j._id === jobId);
  if (job.stageMessage !== previous) { console.log(`${job.status}: ${job.stageMessage}`); previous = job.stageMessage; }
  if (job.status === "completed") {
    const result = await client.query("media:result", { token, jobId });
    for (const kind of ["video", "project", "captions", "poster"]) {
      const response = await fetch(result[kind]);
      if (!response.ok) throw new Error(`${kind} download failed`);
      if (kind === "project") await writeFile("runs/live-smoke-project.json", await response.text());
    }
    console.log(JSON.stringify({ passed: true, jobId, durationSeconds: result.durationSeconds, artifactDownloads: 4 }));
    process.exit(0);
  }
  if (["failed", "cancelled"].includes(job.status)) throw new Error(job.stageMessage);
  await new Promise(resolve => setTimeout(resolve, 5000));
}
throw new Error("Live media smoke timed out");
