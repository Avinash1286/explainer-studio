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
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    // Use fixed diagnostics so provider responses cannot expose credentials or inbox data.
    let guidance = "Check the API key, inbox ID and permissions";
    if (detail?.code === "missing_permission") {
      guidance = typeof detail.fix === "string" && detail.fix.includes("'inbox_read'")
        ? "The API key lacks inbox_read. In the AgentMail console, create or update a key for this inbox with inbox_read and message_send, then replace AGENTMAIL_API_KEY in .env"
        : "The API key lacks a required permission. Check its permissions and scope in the AgentMail console; this app needs inbox_read and message_send";
    } else if (detail?.code === "not_found") {
      guidance = "The inbox was not found within this API key's scope. Check the inbox email address and organization";
    } else if (response.status === 403 && detail?.message === "Forbidden" && !detail.code) {
      guidance = "AgentMail rejected the API credential. Copy the complete active am_ key into AGENTMAIL_API_KEY in .env";
    }
    throw new Error(`AgentMail inbox access failed (${response.status}). ${guidance}. Convex configuration was not changed. No email was sent.`);
  }
  for (const key of required) set(key, process.env[key].trim());
  console.log(`Email configured on ${target.length ? "production" : "development"}. Generation configuration is unchanged. No email was sent.`);
} catch (error) { console.error(error.message); process.exit(1); }
