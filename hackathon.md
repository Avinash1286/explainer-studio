# Explainer Studio — build log

## Project

A single-topic explainer-video system for short educational lessons, using source-grounded scripts, consistent illustrated scenes, narration, and frame review.

- Repository: https://github.com/Avinash1286/explainer-studio
- Live app: https://wooden-pheasant-677.convex.site
- Demo recording: not recorded yet.
- Event: https://www.convex.dev/hackathons/all-gas
- First implementation session in this repository: September 5, 2026. The new repository was created from scratch after the reference-video planning work; commit history records actual implementation. This does not attest to the participant's personal eligibility or registration.

## Current working functionality

Save a lesson brief, choose duration and audience, revisit it in the same browser, and cancel it. Render a fresh copy of an explicitly labelled, original 24.4-second scripted demo with narration and three illustrated layouts. Convex queues the media task; a deployed Zerops worker synthesizes and renders it, then publishes playable video, captions, poster and project/source JSON. Generating a new script from the user's topic is the next phase.

Actual dependencies used: Next.js, TypeScript, React, Convex database/functions/scheduler, Convex static hosting and rate limiter, Lucide icons, bundled fonts, Kokoro 82M, 24 OpenMoji assets, Remotion/FFmpeg, and a Node/Python media worker on Zerops. Convex storage and scheduled mutations implement media execution and recovery. Convex Workflow is installed but not yet used for topic generation.

## Planned model and sponsor roles

| Service | Intended role | Current integration status |
|---|---|---|
| Convex | Authoritative state, jobs, realtime UI, storage, workflow, vectors | Database/functions/hosting/rate limiting/storage and media recovery live; topic workflow and vectors pending |
| NVIDIA NIM | Primary structured text planning | Pending credentials and qualification |
| Cloudflare Workers AI | Qualified text backup; pinned icon embeddings | Pending credentials and qualification |
| Firecrawl | Retrieve research evidence | Pending |
| Kokoro 82M / Zerops | Self-hosted speech and media workers | CPU synthesis/rendering deployed and benchmarked on Zerops |
| OpenMoji | Licensed illustration assets | 24 pinned, hashed SVG assets bundled with CC BY-SA attribution |
| OpenAI | Review real rendered frames and gate repairs/publication | Pending |
| AgentMail | Opt-in completion delivery and delivery status | Pending |

## September 5, 2026 — foundation

Built the responsive static studio, anonymous workspace capabilities with server-side hashing, validated idempotent brief creation, indexed ownership checks, scheduled expiry, rate limits, cancellation, and authenticated heartbeat protocol. Added separate Convex development/production deployments and static frontend hosting. Added TypeScript, lint, backend tests, build scripts, and CI.

Validation: 12 isolated backend tests passed locally; production build passed; desktop/mobile UI inspected; real cloud-backed save, reload, and cancellation exercised. The local heartbeat worker authenticated successfully against cloud development. No media benchmark or provider quality claim is made.

Publication: implementation commit `6182229` was pushed to the public repository. The production static deployment includes asset license notices and the production Convex URL (no development URL in its client chunks). GitHub Actions run [33956613116](https://github.com/Avinash1286/explainer-studio/actions/runs/33956613116) could not start: GitHub reported an account lock due to a billing issue. This is an external CI blocker; it is not recorded as a passing CI run.

A separate clean checkout then passed dependency installation, TypeScript, lint, all 12 tests, static frontend build, and worker build without local credentials or preexisting caches. See `docs/foundation-validation.md` for environment and limits.

Development tooling: Codex used for implementation. Official Convex agent guidance installed through `convex ai-files install`; generated guidance is recorded in the repository. The separate organizer hackathon log skill has not yet been installed; this file is maintained directly from observed work.

## September 5, 2026 ? H1 media phase

Implemented versioned scene contracts, original source-referenced photosynthesis narration, process/comparison/relationship layouts, stroke-to-fill icons, predicted Kokoro word timings, captions and H.264/AAC export. Added session-owned media tasks, renewable leases, attempt fencing, cancellation, bounded recovery, validated artifact publication and abandoned registered-upload cleanup.

Deployed the media worker to a dedicated Zerops service (two shared CPUs, 4 GB RAM). The production job rendered 585 frames / 24.375 seconds at 1280 x 720 in 143.62 seconds: 61.91 seconds inside synthesis and 69.41 seconds in renderer setup/render/poster work. Model/voice warmup preceded this run. The measured Python peak RSS was 1726.64 MiB, not total service memory. Exact data and limitations are in `docs/media-benchmark-zerops.json`.

Validation: 21 backend tests, TypeScript, lint, static export and worker build passed. Frame ordering/determinism and timeline checks passed. A real development worker completed after a simulated worker lost its lease (attempt 2). The production UI played the Zerops result; video, project and captions links returned HTTP 200 with no browser runtime error observed. See `docs/media-phase.md` for reproduction and limitations.

H1 uses a fixed original script. No Firecrawl, NVIDIA, Cloudflare, OpenAI or AgentMail calls are claimed in this phase. A generated sample is available in the app; the separate hackathon demo recording remains pending.

## Remaining before submission

H0 service qualification, Zerops media benchmark, full H1–H4 generation/review/evaluation, sponsor integrations, demo, actual user feedback, participant eligibility/registration checks, social post, and event submission. No test emails, social messages, or submission have been sent. See `PHASES.md` and `plan.md` for gates; an installed package is not evidence of a working sponsor integration.
