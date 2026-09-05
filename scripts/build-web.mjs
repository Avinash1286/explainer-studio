import { spawnSync } from "node:child_process";

// Convex static-hosting provides its target URL as VITE_CONVEX_URL.
// Explicitly map it so a production export never embeds the dev deployment.
const env = { ...process.env };
if (env.VITE_CONVEX_URL) env.NEXT_PUBLIC_CONVEX_URL = env.VITE_CONVEX_URL;
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env, stdio: "inherit" });
process.exit(result.status ?? 1);
