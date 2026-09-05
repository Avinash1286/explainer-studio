// Run only on a test deployment with no other queued media tasks.
// Stop the real worker, run this command, then restart the worker. The simulated
// instance disappears after claiming; Convex must recover after lease expiry.
import { ConvexHttpClient } from "convex/browser";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
if (!process.env.NEXT_PUBLIC_CONVEX_URL || !process.env.CONVEX_SITE_URL || !process.env.WORKER_AUTH_TOKEN) throw new Error("Configure test Convex and worker environments");
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
const token = randomBytes(32).toString("hex");
await client.mutation("sessions:start", { token });
const jobId = await client.mutation("media:createSample", { token, requestId: randomUUID() });
const response = await fetch(`${process.env.CONVEX_SITE_URL}/api/worker/media`, { method: "POST", headers: { Authorization: `Bearer ${process.env.WORKER_AUTH_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ op: "claim", worker: `interrupted-${randomUUID()}` }) });
if (!response.ok) throw new Error("Simulated claim failed");
const lease = await response.json();
console.log(JSON.stringify({ event: "worker_disappeared", jobId, taskId: lease.taskId, attempt: lease.attempt }));
let previous = "";
for (let i=0; i<120; i++) {
  const jobs = await client.query("jobs:list", { token });
  const job = jobs.find(j => j._id === jobId);
  if (job.stageMessage !== previous) { console.log(job.stageMessage); previous = job.stageMessage; }
  if (job.status === "completed") {
    const report = { passed: true, jobId, taskId: lease.taskId, originalAttempt: lease.attempt, recovery: "A claimed worker stopped renewing; scheduled expiry requeued the job and a real worker published it" };
    await writeFile("runs/recovery-smoke.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); process.exit(0);
  }
  if (job.status === "failed") throw new Error(job.stageMessage);
  await new Promise(resolve => setTimeout(resolve, 5000));
}
throw new Error("Recovery smoke timed out");
