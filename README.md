# Explainer Studio

Turn a question into a short illustrated lesson with research, narration, captions, review and targeted revisions.

**Release candidate 0.5.6.** The final three implementation workstreams are present. The five-topic evaluation reached 4/5 automated approvals, with manual visual limitations recorded in [release evidence](docs/release-evidence.md). AgentMail live delivery still needs working inbox credentials and a consented test. Start your recording with the [demo runbook](docs/demo-runbook.md).

- [Public app](https://wooden-pheasant-677.convex.site/)
- [Phase status](PHASES.md), [architecture and reference study](plan.md), [actual hackathon log](hackathon.md)
- [Release operations](docs/release-operations.md), [owner demo runbook](docs/demo-runbook.md), [submission working copy](docs/submission-draft.md)

## Implemented

- Next.js/TypeScript static app on Convex hosting, realtime progress and anonymous browser workspaces.
- Convex workflows, research checkpoints, immutable versions, quotas, cancellation, authenticated media leases and stale-result fencing.
- Firecrawl research; NVIDIA NIM reasoning for planning and factual checking, with Cloudflare Workers AI fallback. No OpenAI model API is used.
- Qualified Cloudflare icon embeddings in Convex vector search. Literal catalog matches reuse the qualified vectors; concepts without faithful icons use animated text cards.
- Local Kokoro-82M on Zerops, deterministic Remotion diagrams, explicit directed relationships, MP4, captions, poster and inspectable project outputs.
- Independent factual and decoded-frame review; one automatic repair, two scene edits, reusable narration cache, bounded planning/review recovery.
- Approved-version share links with expiry/revocation, operator-published examples, opt-in verified-recipient AgentMail outbox and signed delivery callbacks.
- 80 automated tests plus TypeScript, lint and builds. Vercel Git integration runs clean-install validation; GitHub Actions is disabled.

Workspaces use 256-bit bearer tokens with hashes stored in Convex and seven-day expiry. They are not accounts: clearing browser storage loses access. Source/frame review remains fallible; inspect a lesson before presenting it publicly. Existing reference videos are not redistributed.

**Hackathon eligibility:** The selected NVIDIA/Cloudflare-only model stack is deliberate. The official All Gas sponsor-stack criterion names OpenAI, so qualification/scoring remains unconfirmed until organizers clarify it. A public deployment is not an eligibility decision. The owner records the demo and approves any actual social post or submission.

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

Repair reliability evidence and remaining gates: [repair acceptance](docs/repair-acceptance.md). Run `npm run repair:verify -- project.json sources.json review.json runs/repair-verification` for the real local repair/render/review regression. That report is historical; see release evidence for current approved revisions and limitations.
