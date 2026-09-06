import { spawnSync } from "node:child_process";
import { readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Convex static-hosting provides its target URL as VITE_CONVEX_URL.
// Explicitly map it so a production export never embeds the dev deployment.
const env = { ...process.env };
if (env.VITE_CONVEX_URL) env.NEXT_PUBLIC_CONVEX_URL = env.VITE_CONVEX_URL;
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

// SVG source files are worker inputs, not browser requests: Remotion embeds
// only selected images. Keep the website below Convex's static file limit
// while retaining the public catalog/credits and the complete worker library.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = await realpath(path.join(root, "out"));
const directory = await realpath(path.join(output, "lesson-assets"));
if (!directory.startsWith(output + path.sep)) throw new Error("Asset export directory escapes the web output");
const catalog = JSON.parse(await readFile(path.join(root, "packages/assets/catalog.json"), "utf8"));
for (const asset of catalog.entries) {
  if (!/^[a-z][a-z0-9-]{0,99}\.svg$/.test(asset.file)) throw new Error("Invalid asset export filename");
  await unlink(path.join(directory, asset.file));
}
console.log(`Kept ${catalog.entries.length} SVG source files in the worker library; web export retains their catalog and credits.`);
