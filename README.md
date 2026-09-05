# Explainer Studio

Turn a question into a short illustrated lesson with research, narration, captions, review and targeted revisions.

**Working product; final hackathon acceptance is incomplete.** Release 0.6.0 is deployed on Convex, passes the full local check and adds a verified provider selector. OpenAI remains intentionally disabled at the owner's request; enabling it is not required to complete this implementation. AgentMail inbox access and the production webhook are configured; consented delivery acceptance, the owner-recorded demo, actual user trials and final event submission remain open. The frozen baseline evaluation remains 4/5 automated approvals with manual visual limitations. See [release evidence](docs/release-evidence.md) and the [readiness checklist](docs/hackathon-readiness.md).

- [Public app](https://wooden-pheasant-677.convex.site/)
- [Phase status](PHASES.md), [architecture and reference study](plan.md), [actual hackathon log](hackathon.md)
- [Release operations](docs/release-operations.md), [owner demo runbook](docs/demo-runbook.md), [submission working copy](docs/submission-draft.md)

## Implemented

- Next.js/TypeScript static app on Convex hosting, realtime progress and anonymous browser workspaces.
- Convex workflows, research checkpoints, immutable versions, quotas, cancellation, authenticated media leases and stale-result fencing.
- Firecrawl research; NVIDIA NIM reasoning for planning and factual checking, with Cloudflare Workers AI fallback in the verified baseline.
- Shared icon catalog, with qualified Cloudflare embeddings and Convex vector search on the default route. OpenAI uses exact catalog resolution without calling NVIDIA or Cloudflare; concepts without faithful icons use animated text cards.
- Local Kokoro-82M on Zerops, deterministic Remotion diagrams, explicit directed relationships, MP4, captions, poster and inspectable project outputs.
- Independent factual and decoded-frame review; one automatic repair, two scene edits, reusable narration cache, bounded planning/review recovery.
- Approved-version share links with expiry/revocation, operator-published examples, opt-in verified-recipient AgentMail outbox and signed delivery callbacks.
- The latest 0.6.0 repair correction passed `npm run check`: 117 tests across 14 files, TypeScript, ESLint, static app export and worker build. Isolated tests do not establish live OpenAI inference or email delivery. Vercel Git integration runs clean-install validation; GitHub Actions is disabled.

Workspaces use 256-bit bearer tokens with hashes stored in Convex and seven-day expiry. They are not accounts: clearing browser storage loses access. Source/frame review remains fallible; inspect a lesson before presenting it publicly. Existing reference videos are not redistributed.

## Provider choice

Release 0.6.0 adds a per-lesson choice between **NVIDIA NIM + Cloudflare Workers AI** (the default) and **OpenAI**. The OpenAI route uses the Responses API for planning, factual checks, decoded-frame review and repairs. Its default model is `gpt-5.4-mini`, configurable with `OPENAI_MODEL`. Both routes retain Firecrawl research, the existing icon catalog, local Kokoro-82M speech and Remotion/FFmpeg rendering. The selected route stays attached to the lesson through revisions; OpenAI failures do not silently switch providers.

OpenAI is intentionally disabled at the owner's request. Its selectable option safely reports that it is not configured; no live OpenAI inference is claimed. If the owner later enables it, add `OPENAI_API_KEY` and optionally `OPENAI_MODEL` to ignored operator configuration, then run `npm run openai:setup -- --prod` for production qualification. Visitors do not enter API keys. See [release operations](docs/release-operations.md) for setup and [release evidence](docs/release-evidence.md) for checks actually completed.

Production browser checks confirmed the default NVIDIA/Cloudflare selection and the OpenAI missing-key message. Attempting OpenAI created no job; switching to NVIDIA/Cloudflare created one job. Changing the form selection and reloading preserved that live lesson's provider. Desktop and 390-pixel mobile views had no horizontal overflow. The new salt lesson rendered, but source review rejected an unsupported claim and repair failed after NVIDIA 502/Cloudflare 429 responses. It is an unapproved first-attempt failure, tracked separately from selector verification and any later recovery.

Final runtime [`04c4635`](https://github.com/Avinash1286/explainer-studio/commit/04c4635) is on public `main`; its [Vercel validation](https://explainer-studio-checks-1ryoohj3q-avinash1286s-projects.vercel.app) is Ready after a clean install, 117 tests and complete builds. Production and development backends are synced. The media worker remains 0.5.6 with seven capabilities and a heartbeat observed three seconds old. Independent solar playback advanced 24 seconds with captions; its 60.053-second file is 1280×720 with five sources. The initial 109-test selector release remains in the historical evidence.

The separately recorded salt recovery removed only the unsupported phrase and preserved the other three scenes' content. Revision 2 rendered and passed all factual checks, but NVIDIA visual review rejected its first scene for lacking illustrated ions/lattice and directed arrows despite the supported word-card/association layout. Both attempts remain unapproved. The app preserves the editable draft and blocks sharing/email; reviewer variability and word-card limitations remain known issues. Solar remains the sole manually qualified public example.

**Hackathon eligibility:** OpenAI, Firecrawl and AgentMail need demonstrated product use under the [official sponsor-stack criterion](https://www.convex.dev/hackathons/all-gas). OpenAI's implemented but intentionally disabled option does not establish live sponsor usage; disclose that gap and obtain organizer clarification before claiming compliance. AgentMail still needs a requested delivery before receipt can be claimed. Participant eligibility, registration and organizer acceptance remain separate from the completed provider implementation.

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
