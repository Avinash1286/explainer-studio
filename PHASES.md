# Implementation phases

The detailed H0–H6 acceptance gates remain in `plan.md`, section 11. This status file separates completed work from planned capabilities.

| Milestone | Status | Evidence / next gate |
|---|---|---|
| H0a: application foundation | Implemented | Public static app; real Convex create/list/cancel; ownership and quotas; worker heartbeat contract; automated checks and browser verification. |
| H0b: external service and media qualification | Partial | Media runtime qualified on Zerops. NVIDIA, Cloudflare and Firecrawl qualified in development and production. Cloudflare vision now returned a real stored rejection; AgentMail, intended inbox and official hackathon log integration remain pending. |
| H1: original rendered fixture | Complete | Deployed and verified; see `docs/media-phase.md`. |
| H2: topic to complete explainer | Pipeline verified; content gate pending | Real browser topic produced a 60-second draft with captions and sources. Timing/playback passed; incorrect icon labels failed content inspection. Production generation remains disabled. See `docs/topic-generation.md`. |
| H3: review, revision, delivery | Implemented; live provider acceptance pending | Source and decoded-frame review gate, one automatic repair, two targeted user revisions, Kokoro scene cache, verified AgentMail outbox and signed callbacks. See `docs/review-delivery.md`. |
| H4: evaluation | Pending | Five unseen topics, real user trials, failure/recovery and access checks. |
| H5: release evidence | Pending | Reproducible setup, final licenses, recorded demo, social/submission draft. |
| H6: submission | Pending | Owner-authorized social publishing and submission; real receipt recorded. |

## H0a acceptance evidence

- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed locally; 12 backend tests.
- A separate clean checkout also passed `npm ci` and the complete check without credentials. Hosted GitHub CI is blocked by an account billing lock; its result is not a pass.
- Browser: save a lesson, reload the address, observe persisted data, cancel, and observe realtime cancelled state.
- Browser: desktop and 390-pixel mobile layout inspected; no browser runtime errors observed.
- Public Convex production deployment: `wooden-pheasant-677`; separate development deployment: `lovely-dalmatian-395`.
- Bundled local worker completed an authenticated heartbeat against cloud development; its health endpoint reported ready with heartbeat-only capability.
- `generationEnabled: false` is intentional. No placeholder video is presented as a generated result.

## H1 acceptance evidence

- `npm run check` passed: TypeScript, ESLint, 21 backend tests, Next static export and Node worker bundles.
- Local original fixture: 585 frames, 1280 x 720, 24 fps, 24.375-second timeline; three layout families, predicted Kokoro word timing, burned captions and WebVTT.
- Frame verification passed, including rendering the same frame after out-of-order requests and comparing PNG bytes.
- Production Zerops worker rendered the demo in 143.62 seconds on two shared CPUs / 4 GB RAM. Python TTS peak RSS was 1726.64 MiB; this is not total service memory. See `docs/media-benchmark-zerops.json`.
- Live production browser played the result; MP4, project/source JSON and captions returned HTTP 200. Development smoke also downloaded all four artifacts.
- A simulated worker stopped renewing its lease. Scheduled recovery reassigned the job and a real worker published attempt 2. See `docs/media-recovery-live.json`.
- Scripted demo is explicitly labelled. General topic generation remains disabled.

## H2 implementation evidence

- Durable Convex workflow: research, plan, semantic icon retrieval and media handoff.
- Shared validation for NVIDIA and Cloudflare, bounded repair and transient-error fallback.
- Provider setup command reads ignored `.env`, qualifies real APIs and initializes the icon vector index before enabling generation.
- Isolated workflow tests use simulated providers. No live provider quality or general-generation success is claimed before credentials are added.
- Existing scripted demo remains available while topic generation is disabled.

## Next gate

Cloudflare frame review is working with existing credentials. Complete the bounded repair acceptance and configure AgentMail for H3, then verify a consented test email and user edit before enabling production. Vercel Git integration supplies automated validation on Hobby; GitHub Actions is disabled. AgentMail qualification and sponsor-stack eligibility clarification remain pending.

## H3 implementation evidence

- Release 0.4.0 adds version-bound review, repair and delivery workflows.
- 53 automated tests cover source/frame gate, false-positive icon regression, scope and revision fencing, mailbox verification, idempotent delivery, raw-body signatures and expiry.
- Live provider acceptance is using existing Cloudflare credentials; AgentMail delivery still needs its separate credentials. No live review approval or sent email is claimed.
