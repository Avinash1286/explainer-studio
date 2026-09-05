import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
try { loadEnvFile(".env"); } catch { /* Process environment is supported. */ }
const required = ["AGENTMAIL_API_KEY", "AGENTMAIL_INBOX_ID", "AGENTMAIL_WEBHOOK_SECRET"];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) { console.error(`Add these to .env: ${missing.join(", ")}`); process.exit(1); }
const target = process.argv.includes("--prod") ? ["--prod"] : [];
function set(key, value) {
  const result = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", "env", "set", key, ...target], { input: value, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Could not configure ${key}; verify CLI authentication`);
  console.log(`Configured ${key}`);
}
try {
  const response = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(process.env.AGENTMAIL_INBOX_ID.trim())}`, { headers: { Authorization: `Bearer ${process.env.AGENTMAIL_API_KEY.trim()}` }, signal: AbortSignal.timeout(20000), redirect: "error" });
  if (!response.ok) throw new Error(`AgentMail inbox access failed (${response.status}). Check the API key, inbox ID and permissions before configuring Convex. No email was sent.`);
  for (const key of required) set(key, process.env[key].trim());
  console.log(`Email configured on ${target.length ? "production" : "development"}. Generation configuration is unchanged. No email was sent.`);
} catch (error) { console.error(error.message); process.exit(1); }
