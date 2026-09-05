import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";

try { loadEnvFile(".env"); } catch { /* Existing process environment is also supported. */ }
const keys = ["NVIDIA_API_KEY", "FIRECRAWL_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"];
const missing = keys.filter(key => !process.env[key]?.trim());
if (missing.length) { console.error(`Add these to .env: ${missing.join(", ")}`); process.exit(1); }
const target = process.argv.includes("--prod") ? ["--prod"] : [];
const keepDisabled = process.argv.includes("--keep-disabled");
function cli(args, input) {
  // No shell interpolation or secrets in argv. Convex reads values from stdin.
  const result = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", ...args, ...target], { input, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Convex ${args[0]} failed. Check CLI authentication and deployment selection.`);
  return result.stdout.trim();
}
try {
  cli(["env", "set", "GENERATION_ENABLED"], "false");
  for (const key of keys) { cli(["env", "set", key], process.env[key].trim()); console.log(`Configured ${key}`); }
  const result = JSON.parse(cli(["run", "icons:qualify", "{}"]));
  if (!result.passed) throw new Error(`Provider qualification did not pass: ${result.report}`);
  if (!keepDisabled) cli(["env", "set", "GENERATION_ENABLED"], "true");
  console.log(`Providers and icon index qualified on ${target.length ? "production" : "development"}. Topic generation ${keepDisabled ? "remains disabled for acceptance review" : "enabled"}.`);
  console.log(result.report);
} catch (error) { console.error(error.message); process.exit(1); }
