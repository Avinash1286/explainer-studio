# Implementation phases

**Current visual work:** the illustrated director, original SVG objects, staged actions and clean canvas are implemented. The actual NIM-authored 60-second lesson rendered, but revision 1 was rejected and revision 2's review was unavailable. Visual acceptance remains open; OpenAI remains intentionally disabled. See the [visual acceptance record](docs/visual-acceptance-070.md) for current versions, checks, deployment state and results, and [visual direction](docs/visual-direction-070.md) for reference criteria.

## Historical 0.5–0.6 milestones

The table records the previous release, not acceptance of the new visual workflow. The frozen evaluation and previous public example remain baseline evidence. See [release evidence](docs/release-evidence.md) and [hackathon readiness](docs/hackathon-readiness.md).

| Workstream | Implementation | Acceptance |
|---|---|---|
| 1. Generation quality and reliability | Compact source-ID authoring, literal icons/text cards, explicit edges, reasoning-based factual check, NVIDIA vision fallback, bounded recovery | Baseline 0.5.6 passed 80 tests. Frozen five-topic test: 4/5 automatic approvals, three at revision 1 and one after automatic repair. Manual quality remains a separate check. |
| 2. Complete lesson workflow | Review findings, one-scene edits, narration cache, artifact links, expiring/revocable shares, public examples, opt-in email outbox | Anonymous share playback and revocation verified. AgentMail configured-inbox lookup returned HTTP 200 with an identity match; production delivery webhook configured. Consented recipient verification/delivery acceptance remains pending. |
| 3. Release preparation | Convex app 0.6.0 deployed; development backend synced; final runtime `04c4635` public with Vercel Ready; worker 0.5.6 | Exact-commit clean install passed 117 tests in 14 files plus types/lint/builds. Public health/worker and solar playback verified. Salt recovery rendered and passed all factual checks but failed visual review; both attempts remain unapproved. No build or topic run remains in progress. |
| 4. Provider choice update | 0.6.0 implements selected OpenAI Responses planning, factual/frame review and repairs, retaining NVIDIA/Cloudflare as default; OpenAI intentionally disabled at the owner's request | Latest full check passed: 117 tests in 14 files plus types, lint and builds. Production browser verified unavailable OpenAI creates zero jobs, default-route submission creates one, and the existing lesson's provider survives form changes/reload. Desktop/390-pixel mobile views have no overflow. Enabling OpenAI is not an implementation exit gate; live sponsor usage remains absent. |

## Remaining acceptance

Remaining gates include the rollout and visual checks in the central acceptance record, a provider-approved lesson that also passes manual playback and the owner's reference comparison, consented AgentMail delivery, 3–5 real user trials, the owner-recorded demo, sponsor/participant eligibility, registration and final submission. The historical salt recovery was not approved. The frozen 4/5 automatic result is not a manual-quality pass or user-trial result.

The entries below are historical development notes. They do not override the current release-evidence report or imply production is still disabled. No email, social post or submission receipt is claimed without a real event.

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

## Historical H3 gate

Cloudflare frame review is working with existing credentials. Complete the bounded repair acceptance and configure AgentMail for H3, then verify a consented test email and user edit before enabling production. Vercel Git integration supplies automated validation on Hobby; GitHub Actions is disabled. AgentMail qualification and sponsor-stack eligibility clarification remain pending.

## H3 implementation evidence

- Release 0.4.0 adds version-bound review, repair and delivery workflows.
- 53 automated tests cover source/frame gate, false-positive icon regression, scope and revision fencing, mailbox verification, idempotent delivery, raw-body signatures and expiry.
- Live provider acceptance is using existing Cloudflare credentials; AgentMail delivery still needs its separate credentials. No live review approval or sent email is claimed.

Provider migration acceptance: the development backend stored a real Cloudflare rejection from eight decoded frames. One automatic repair failed to produce a supported replacement; the original draft remains unapproved. The reviewer migration is verified, but successful content repair and email acceptance are not complete. Production backend and frontend were deployed, HTTP 200 was verified, and generation remains disabled. Next: improve repair reliability and validate a fresh topic, then complete the separate consented AgentMail delivery test.

## Repair reliability phase

62 tests and full builds pass. Catalog-constrained replacements, bounded invalid-output failover, whole-sentence narration fitting, audited one-time repair recovery and a resumable local verification CLI are implemented. A real 60-second repaired draft rendered, but frame review hit Cloudflare 429 and manual inspection rejected incomplete text and unclear diagram logic. The final compiler rejects the incomplete takeaway. A fresh water-cycle job failed planning on a Cloudflare transport/deadline error. Neither result counts as approved content. See `docs/repair-acceptance.md` and `.json`. Next: fresh-planner reliability and causal diagrams, then user revision and consented email acceptance before H4.
