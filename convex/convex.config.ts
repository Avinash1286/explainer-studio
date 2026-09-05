import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import { v } from "convex/values";

const app = defineApp({ httpPrefix: "/api", env: {
  WORKER_AUTH_TOKEN: v.optional(v.string()), GENERATION_ENABLED: v.optional(v.string()),
  NVIDIA_API_KEY: v.optional(v.string()), FIRECRAWL_API_KEY: v.optional(v.string()),
  CLOUDFLARE_ACCOUNT_ID: v.optional(v.string()), CLOUDFLARE_API_TOKEN: v.optional(v.string()),
} });
app.use(staticHosting, { httpPrefix: "/" });
app.use(workflow);
app.use(rateLimiter);
export default app;
