# Explainer Studio

Turn a question into a short, illustrated lesson. This repository implements a staged agentic explainer-video system.

**Current release: H3 implemented; review and email awaiting qualification.** Visitors can save lesson briefs and render a fresh, scripted plant-energy demo with Kokoro narration and three animated layouts. Topic research and generation are implemented behind a provider qualification gate. The static plant sketch is labelled separately from rendered results.

- Live app: https://wooden-pheasant-677.convex.site
- Build status and next steps: [PHASES.md](PHASES.md)
- Architecture and reference study: [plan.md](plan.md)
- Actual hackathon progress: [hackathon.md](hackathon.md)

## Implemented

- Next.js 16 static export with TypeScript, local fonts, responsive UI, and reduced-motion support.
- Convex database and realtime lesson subscriptions, hosted with the Convex static-hosting component.
- Anonymous browser workspaces: 256-bit bearer capabilities, server-side token hashes, seven-day expiry, and ownership checks. This is not account sign-in. Clearing browser storage loses access; no cross-device recovery is implemented.
- Validated brief creation, idempotent retries, cancellation, per-workspace and global creation quotas using the Convex rate-limiter component.
- Kokoro 82M narration, predicted token timing, three Remotion layouts, 24 OpenMoji assets, and MP4/captions/poster/project outputs.
- Authenticated media leases with cancellation, fencing, bounded retries, artifact validation, and idempotent publication.
- 52 automated tests and Vercel Git-based validation. GitHub Actions is disabled at the owner's request. See [continuous validation](docs/continuous-validation.md).

Convex Workflow coordinates Firecrawl research, NVIDIA planning with Cloudflare fallback, and Cloudflare embeddings in Convex vector search. Both deployments passed provider qualification, and a real topic produced a 60-second draft video. Production generation remains gated because content inspection found inaccurate icon labels. OpenAI source/frame review, bounded repair, targeted scene edits and opt-in AgentMail are implemented; real provider acceptance remains pending. See [H3 setup and acceptance](docs/review-delivery.md). See [provider setup and the H2 guide](docs/topic-generation.md). See [the media phase guide](docs/media-phase.md) for renderer setup, measured results, and recovery limits.

## Local development

Use Node.js 22.18+ and npm. The scripted demo does not require model-provider API keys.

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

`preflight` reports local variable presence only; it does not verify API access or inspect secrets configured in Convex. `check` builds both the web export and the media worker. The tests run isolated Convex mocks and require no cloud credentials.

## Deploy the frontend and backend

Create a default production deployment in your Convex project, then run:

```sh
npx convex deploy --yes
npm run deploy
```

The static-hosting CLI supplies the production URL as `VITE_CONVEX_URL`; `scripts/build-web.mjs` maps it to `NEXT_PUBLIC_CONVEX_URL` before the Next build. Do not upload a development export to production. Application HTTP endpoints are under `/api`; the static site is mounted at `/`.

## Media worker

Create a random secret of at least 32 characters. Configure the same `WORKER_AUTH_TOKEN` in Convex and the worker environment, without committing it. Set `CONVEX_SITE_URL` to the matching deployment's `https://…convex.site` URL, `WORKER_ID` to a unique service name, and optionally `PORT` (default 3001).

```sh
npm run build:worker
npm run worker
```

The worker renews media leases and sends a heartbeat every 15 seconds. Its `/health` requires a recent successful heartbeat. Install Python and the media dependencies from [docs/media-phase.md](docs/media-phase.md) before running it. Never give a media worker a Convex administrative deployment key.

`zerops.yaml` prepares Ubuntu/Node 22 with Python 3.12, CPU Kokoro, browser libraries, and FFmpeg. `zerops-import.yaml` defines resource limits; secrets are supplied separately. The media phase report records actual deployment and benchmark evidence.

## Structure

```text
app/                 Next.js pages and styling
components/          Studio interface and original style study
convex/              Database, functions, rate limits, tests, HTTP routes
packages/contracts/  Shared types and limits
workers/media/       Media-worker entry point and renderer
scripts/             Build and configuration helpers
docs/                Milestone evidence and operational notes
```

The initial repository uses one package to keep setup small; the plan's `apps/web` split is deferred until a second application justifies it. Original reference videos, model weights, runtime caches, generated media, and credentials are excluded. See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for asset notices.

## Contribution workflow

Read `AGENTS.md` and the generated Convex guidelines before backend changes. `npx convex ai-files install` refreshes the official Convex agent guidance and installs local skills. Submit only validated changes; update the phase record with evidence and limitations. Provider credentials belong server-side in Convex, except the worker's narrowly scoped credential in Zerops. Public environment variables must never contain secrets.
