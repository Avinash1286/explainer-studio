const groups = {
  frontend: ["NEXT_PUBLIC_CONVEX_URL"],
  worker: ["CONVEX_SITE_URL", "WORKER_AUTH_TOKEN"],
  nvidia: ["NVIDIA_API_KEY"],
  cloudflare: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
  firecrawl: ["FIRECRAWL_API_KEY"],
  agentmail: ["AGENTMAIL_API_KEY", "AGENTMAIL_INBOX_ID", "AGENTMAIL_WEBHOOK_SECRET"],
};
console.log("Local configuration only. Presence does not verify API access; cloud-only secrets are not inspected.");
for (const [name, keys] of Object.entries(groups)) {
  const missing = keys.filter((key) => !process.env[key]?.trim());
  console.log(`${name}: ${missing.length ? `missing ${missing.join(", ")}` : "configured (unverified)"}`);
}
