import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
try { loadEnvFile(".env"); } catch { /* Process environment is supported. */ }
const required = ["OPENAI_API_KEY", "AGENTMAIL_API_KEY", "AGENTMAIL_INBOX_ID", "AGENTMAIL_WEBHOOK_SECRET"];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) { console.error(`Add these to .env: ${missing.join(", ")}`); process.exit(1); }
const target = process.argv.includes("--prod") ? ["--prod"] : [];
function set(key, value) {
  const result = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", "env", "set", key, ...target], { input: value, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Could not configure ${key}; verify CLI authentication`);
  console.log(`Configured ${key}`);
}
try {
  set("GENERATION_ENABLED", "false");
  for (const key of required) set(key, process.env[key].trim());
  set("OPENAI_REVIEW_MODEL", process.env.OPENAI_REVIEW_MODEL?.trim() || "gpt-4.1-2025-04-14");
  console.log(`Review/email configured on ${target.length ? "production" : "development"}. Generation remains disabled until live acceptance passes. No email was sent.`);
} catch (error) { console.error(error.message); process.exit(1); }
