# Explainer Studio

Turn a question into a short, illustrated lesson. This repository is the first implementation milestone of an agentic explainer-video system.

**Current release: foundation.** Visitors can save, revisit, and cancel lesson briefs. Research, narration, animation, and video generation are not implemented yet. The plant illustration is an original static style study, not a generated result.

- Live app: https://wooden-pheasant-677.convex.site
- Build status and next steps: [PHASES.md](PHASES.md)
- Architecture and reference study: [plan.md](plan.md)
- Actual hackathon progress: [hackathon.md](hackathon.md)

## Implemented

- Next.js 16 static export with TypeScript, local fonts, responsive UI, and reduced-motion support.
- Convex database and realtime lesson subscriptions, hosted with the Convex static-hosting component.
- Anonymous browser workspaces: 256-bit bearer capabilities, server-side token hashes, seven-day expiry, and ownership checks. This is not account sign-in. Clearing browser storage loses access; no cross-device recovery is implemented.
- Validated brief creation, idempotent retries, cancellation, per-workspace and global creation quotas using the Convex rate-limiter component.
- Authenticated media-worker heartbeat endpoint and a Node worker with health checks and shutdown handling. Its only current capability is heartbeat.
- Twelve backend tests and GitHub Actions for type checking, lint, tests, and production builds.

Convex Workflow is installed for the next milestone; no generation workflow runs in this release. The full planned stack adds NVIDIA NIM with Cloudflare Workers AI text fallback, pinned icon embeddings, Firecrawl, Kokoro 82M, OpenMoji, Remotion/FFmpeg on Zerops, OpenAI frame review, and opt-in AgentMail delivery.

## Local development

Use Node.js 22.18+ and npm. This foundation does not require any model-provider keys.

```sh
npm ci
npx convex dev
```

Select or create your own Convex project when prompted. The CLI writes `.env.local`. Set `NEXT_PUBLIC_CONVEX_URL` to that development deployment's cloud URL if it is not added automatically. In another terminal:

```sh
npm run dev
```

Open http://127.0.0.1:3000. With no public Convex URL, the page displays a disconnected preview and saving is disabled. Do not use somebody else's deployment for local development.

```sh
npm run check
npm run preflight
```

`preflight` reports local variable presence only; it does not verify API access or inspect secrets configured in Convex. `check` builds both the web export and the heartbeat worker. The tests run isolated Convex mocks and require no cloud credentials.

## Deploy the frontend and backend

Create a default production deployment in your Convex project, then run:

```sh
npx convex deploy --yes
npm run deploy
```

The static-hosting CLI supplies the production URL as `VITE_CONVEX_URL`; `scripts/build-web.mjs` maps it to `NEXT_PUBLIC_CONVEX_URL` before the Next build. Do not upload a development export to production. Application HTTP endpoints are under `/api`; the static site is mounted at `/`.

## Worker foundation

Create a random secret of at least 32 characters. Configure the same `WORKER_AUTH_TOKEN` in Convex and the worker environment, without committing it. Set `CONVEX_SITE_URL` to the matching deployment's `https://…convex.site` URL, `WORKER_ID` to a unique service name, and optionally `PORT` (default 3001).

```sh
npm run build:worker
npm run worker
```

The worker sends a heartbeat every 15 seconds to `/api/worker/heartbeat`; its `/health` returns 200 only after a successful recent heartbeat. `renderingReady` remains false. Never give a media worker a Convex administrative deployment key.

`zerops.yaml` contains the Ubuntu/Node 22 build and run configuration for a service named `mediaworker`. Service provisioning and environment variables are separate from this file. This milestone does not deploy Kokoro, Chromium, or FFmpeg to Zerops; H0/H1 will add and benchmark that runtime before accepting media jobs.

## Structure

```text
app/                 Next.js pages and styling
components/          Studio interface and original style study
convex/              Database, functions, rate limits, tests, HTTP routes
packages/contracts/  Shared types and limits
workers/media/       Media-worker entry point (heartbeat only today)
scripts/             Build and configuration helpers
docs/                Milestone evidence and operational notes
```

The initial repository uses one package to keep setup small; the plan's `apps/web` split is deferred until a second application justifies it. Original reference videos, model weights, runtime caches, generated media, and credentials are excluded. See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for asset notices.

## Contribution workflow

Read `AGENTS.md` and the generated Convex guidelines before backend changes. `npx convex ai-files install` refreshes the official Convex agent guidance and installs local skills. Submit only validated changes; update the phase record with evidence and limitations. Provider credentials belong server-side in Convex, except the worker's narrowly scoped credential in Zerops. Public environment variables must never contain secrets.
