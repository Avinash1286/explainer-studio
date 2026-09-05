import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import { DEFAULT_OPENAI_MODEL, openAIErrorMessage } from "../packages/contracts/provider.ts";
try { loadEnvFile(".env"); } catch { /* Inherited environment is supported. */ }
const key = process.env.OPENAI_API_KEY?.trim();
const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
const target = process.argv.includes("--prod") ? ["--prod"] : [];
try {
  if (!key) throw new Error("Add OPENAI_API_KEY to .env to configure the optional OpenAI route. NVIDIA/Cloudflare settings are unchanged.");
  if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(model)) throw new Error("Set OPENAI_MODEL to a valid Responses API model ID supporting text, images and structured outputs.");
  const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
    headers: { Authorization: `Bearer ${key}` }, redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(openAIErrorMessage(response.status));
  const data = await response.json();
  if (data.id !== model) throw new Error("OpenAI did not confirm the configured model.");
  for (const [name, value] of [["OPENAI_API_KEY", key], ["OPENAI_MODEL", model]]) {
    const result = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", "env", "set", name, ...target], { input: value, encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(`Could not configure ${name}; verify Convex CLI authentication.`);
    console.log(`Configured ${name}`);
  }
  console.log(`OpenAI model access checked and settings saved to ${target.length ? "production" : "development"}. A real generation is still required for inference acceptance. Generation activation is unchanged.`);
} catch (error) {
  const message = error instanceof Error ? error.message : "OpenAI setup failed";
  console.error(key ? message.split(key).join("[redacted]") : message);
  process.exitCode = 1;
}
