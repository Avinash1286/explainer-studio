# Explainer Studio — build log

**Current visual update — September 6:** the illustrated director and clean-canvas renderer are implemented. An actual NIM-authored 60-second lesson rendered: revision 1 was rejected and revision 2's review was unavailable. Visual acceptance remains open; OpenAI remains intentionally disabled. The [visual acceptance record](docs/visual-acceptance-070.md) owns current versions, checks, deployment state and the complete attempt history. The [reference criteria](docs/visual-direction-070.md) and historical 0.6.0 evidence remain separate.

## Project

A single-topic explainer-video system for short educational lessons, using source-grounded scripts, consistent illustrated scenes, narration, and frame review.

- Repository: https://github.com/Avinash1286/explainer-studio
- Live app: https://wooden-pheasant-677.convex.site
- Demo recording: not recorded yet.
- Event: https://www.convex.dev/hackathons/all-gas
- First implementation session in this repository: September 5, 2026. The new repository was created from scratch after the reference-video planning work; commit history records actual implementation. This does not attest to the participant's personal eligibility or registration.

## Historical 0.6.0 working functionality

Release 0.6.0 frontend and backend are deployed on Convex; public health returns HTTP 200 with generation enabled. A visitor can submit a question, choose duration, audience and provider, watch realtime progress, revisit the lesson in the same browser and cancel a run. The established NVIDIA/Cloudflare pipeline uses Firecrawl research and the existing Zerops Kokoro/Remotion/FFmpeg worker. Approved versions expose video, captions, source/project data, targeted scene revisions and revocable share links. The manually inspected solar revision 3 remains available in the gallery.

Baseline validation passed 80 automated tests, TypeScript, lint and builds. The frozen five-topic evaluation achieved 4/5 automated approvals with manual visual limitations; those results are not real user trials. Earlier failures and the separate bicycle timing replay remain in [release evidence](docs/release-evidence.md).

Release 0.6.0 implements an OpenAI provider option alongside the default NVIDIA NIM + Cloudflare Workers AI route. It uses the Responses API for planning, factual review, decoded-frame review and repairs, with `gpt-5.4-mini` as the configurable `OPENAI_MODEL` default. The latest bounded-repair correction passed 117 tests across 14 files, TypeScript, ESLint, static export and worker build, and is deployed to the backend. Browser checks confirmed default selection, unavailable OpenAI creating zero jobs, and a subsequent default-route submission creating one job. The owner explicitly chose to leave OpenAI disabled; enabling it is not required to complete this implementation, and no live OpenAI inference is claimed.

The 0.6.0 runtime [`04c4635`](https://github.com/Avinash1286/explainer-studio/commit/04c4635) reached public main and its [Vercel validation](https://explainer-studio-checks-1ryoohj3q-avinash1286s-projects.vercel.app) passed an exact-commit clean install, 117 tests and full builds. At that release, production and development backends were synced and the media worker was 0.5.6 with seven capabilities. Initial `0ebfce2`/109-test evidence remains in the historical log. Desktop/390-pixel mobile layouts had no overflow; changing the form provider and reloading preserved the live lesson's NVIDIA/Cloudflare selection. Independent-browser solar playback advanced 24 seconds with captions, a 60.053-second 1280×720 file and five source links.

The salt regression finished without approval. Its initial source rejection and service-failed repair remain recorded. One operator recovery removed only the unsupported phrase, preserved the other three scenes' content and produced a 60-second revision 2 with all four factual checks passing. NVIDIA visual review nevertheless rejected scene 1 for lacking illustrated ions/lattice and directed arrows despite the supported word-card/association layout. Neither attempt is approved; the draft remains editable, sharing/email stay closed, and solar remains the sole manually qualified public example. No further tuning or live attempt is in progress for this topic.

## Current service and sponsor roles

| Service | Intended role | Current integration status |
|---|---|---|
| Convex | Authoritative state, jobs, realtime UI, storage, workflow, vectors | Live production generation/revision/sharing and static hosting verified |
| NVIDIA NIM | Default-route planning, visual direction, factual review and qualified vision fallback | Actual directed 60-second lesson rendered; revision 1 rejected, revision 2 review unavailable; visual acceptance open |
| Cloudflare Workers AI | Default-route text backup, frame review and pinned icon embeddings | Real provider evidence recorded; quota exhaustion and NVIDIA vision fallback documented |
| OpenAI | Optional selected route for planning, visual direction, factual/frame review and repairs | Provider choice introduced in 0.6.0; intentionally disabled at the owner's request; no live sponsor usage |
| Firecrawl | Retrieve research evidence | Live qualification and source-backed lesson use recorded |
| Kokoro 82M / Zerops | Self-hosted speech and media workers | CPU synthesis/rendering deployed and benchmarked on Zerops |
| Original SVG library / OpenMoji | New directed illustrations / legacy catalog assets | 51 bounded visual kinds, including 35 original everyday drawings; 24 pinned OpenMoji assets retained with attribution |
| AgentMail | Opt-in completion delivery and delivery status | Configured-inbox GET returned HTTP 200 with matching identity; production webhook configured; consented delivery acceptance pending |

## Remaining before final entry

Complete the rollout and visual checks in the central acceptance record, including an approved generated lesson that passes manual playback and the owner's reference comparison. Verify consented AgentMail delivery, complete 3–5 real user trials and respond to feedback, record/upload the owner demo, clarify sponsor eligibility with OpenAI intentionally disabled, and complete the actual social post and VibeApps submission. Participant eligibility and Luma registration remain unverified. The old build and recovery evidence does not close the new visual acceptance. See [hackathon readiness](docs/hackathon-readiness.md), [demo runbook](docs/demo-runbook.md) and [submission draft](docs/submission-draft.md). The official deadline is September 22, 2026 at noon Pacific (September 23, 00:45 Nepal time).

## Historical work log

The dated entries below record what was true during each phase. Earlier references to disabled generation, pending providers, GitHub Actions or the former OpenAI restriction do not override the current summary and release evidence.

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

## September 5, 2026 - H2 implementation

Added a durable research/planning/retrieval workflow, common structured-output validation, primary-to-backup rate-limit routing, versioned Convex icon vector search, protocol-2 generated-project rendering and a safe `.env` provider setup command. Production remains gated until real qualification succeeds. The owner will supply credentials after implementation; simulated provider tests must not be represented as sponsor API usage.

See `docs/topic-generation.md` for setup, tests and remaining live acceptance. The generated-project renderer is exercised separately with a scripted validation input. No Firecrawl, NVIDIA or Cloudflare production request is claimed yet.

## Historical remaining work after H2

H0 service qualification, Zerops media benchmark, full H1–H4 generation/review/evaluation, sponsor integrations, demo, actual user feedback, participant eligibility/registration checks, social post, and event submission. No test emails, social messages, or submission have been sent. See `PHASES.md` and `plan.md` for gates; an installed package is not evidence of a working sponsor integration.


## September 5, 2026 - live provider qualification and CI migration

Both Convex deployments passed real NVIDIA text, real Cloudflare backup behind an injected primary 429, Firecrawl research and 24 icon embeddings. A browser topic generated a 60-second draft in development. The successful media attempt took 117.31 seconds; playback and all artifact URLs passed. Content inspection found incorrect pollen/ovule/seed/soil icon labels, so production topic generation remains disabled pending H3 review and repair. See docs/topic-generation-live.json and docs/topic-generation.md.

GitHub Actions is disabled at repository level and its workflow removed. Vercel Git integration on Hobby runs npm run check; commit accd258 passed with 41 tests plus TypeScript, lint and both builds. No paid Vercel plan or trial was enabled. Worker 0.3.1 adds bounded scene holds and operator recovery with monotonic lease fencing.

## H3 implementation - September 5, 2026

Version-bound source and actual decoded-frame review, bounded automatic repair, targeted revision, scene narration reuse, verified-recipient outbox and signed delivery webhooks are implemented. 52 isolated tests pass; the initial OpenAI plan is superseded by the owner's NVIDIA/Cloudflare-only constraint; Cloudflare vision acceptance uses existing credentials and AgentMail remains separate. Production generation stays gated. No official event-log integration, real OpenAI approval, received test email or H3 acceptance completion is claimed.

Provider migration acceptance: the development backend stored a real Cloudflare rejection from eight decoded frames. One automatic repair failed to produce a supported replacement; the original draft remains unapproved. The reviewer migration is verified, but successful content repair and email acceptance are not complete. Production backend and frontend were deployed, HTTP 200 was verified, and generation remains disabled. Next: improve repair reliability and validate a fresh topic, then complete the separate consented AgentMail delivery test.

## Repair reliability ? September 5, 2026

Implemented bounded NVIDIA/Cloudflare invalid-output fallback, source-ID repair compilation, canonical icon/cue constraints, optional-sentence duration fitting, incomplete-takeaway rejection, one audited operator recovery, and a resumable local repair/render/review CLI. 62 tests and builds pass. A real repaired clip rendered in 150.84 seconds on Windows; Cloudflare frame review returned 429 and manual inspection rejected its incomplete takeaway and diagram semantics. A fresh water-cycle test failed during planning. No new approval, email, H3 acceptance completion or sponsor-eligibility confirmation is claimed. Production generation stays disabled. See docs/repair-acceptance.md.


## Final three implementation workstreams - September 5, 2026

Release 0.5.4 adds compact source-ID authoring, literal icons/word cards, explicit directed relationships, independent reasoning-based factual review, real NVIDIA vision fallback, bounded recovery, approved-version sharing and a public example gallery. All inference uses NVIDIA/Cloudflare, with local Kokoro on Zerops. No OpenAI model API or GitHub Actions is used.

The exact local release check passed 76 tests, TypeScript, lint, web export and media bundles. A real Moon revision preserved four unaffected scenes and reused four narration cache entries. Production solar-cell generation, a scene edit, anonymous share playback with captions and revocation passed. Zerops 0.5.4 has a verified fresh heartbeat. See docs/release-evidence.md for the complete mixed evaluation, provider failures, manual rejections, deployment verification and final activation record. Automated approval is not a guarantee of factual or visual quality.

AgentMail inbox access returns 403 and no consented email test has happened. The owner will record the demo. No user-trial feedback, social post, final submission or sponsor-eligibility confirmation is invented. docs/demo-runbook.md and docs/submission-draft.md provide the recording/submission preparation.


## Content and cancellation hardening - release 0.5.5

Live testing found icon-conditioned filler, unnecessary scene rewrites during repair, and a cancellation error after the planner had already completed. The planner now writes content before selecting visuals, repairs receive original scenes and preserve correct text/length, and cancellation checks workflow state before fencing media. 79 tests plus type, lint and builds passed. The tracked topic evaluator stores resumable private workspaces and sanitized public results; no mail or operator recovery is involved. Failed and interrupted earlier batches are retained. The public solar revision 3 is manually inspected and available in the gallery, and public generation is enabled. Final evaluation outcomes remain in docs/release-evidence.md rather than being inferred from passing tests.

## September 5 - final three-workstream acceptance

Release 0.5.6 passes 80 tests and the complete local check. The predeclared five-topic run on 0.5.5 reached 4/5 automatic approvals without operator retries or requested edits; three passed initially and one after automatic repair. The failed bicycle timing case remains in the report. Manual inspection found limited visual variety and label layout issues, so only the separately curated solar example is public. A focused 0.5.6 renderer correction improves long titles/labels and permits bounded reading holds without changing evaluated authoring/review logic.

Implemented: provider failover, source and actual-frame review, bounded repair, durable media jobs, cancellation, scene editing, narration reuse, downloads, approved-version sharing/revocation, public example, deployment checks, evaluation CLI, recording guide and submission draft. AgentMail live acceptance remains blocked by `missing_permission` and absent inbox/webhook configuration. No OpenAI inference, GitHub Actions, emails, social posts or final submission were added. See docs/release-evidence.md for final deployment and regression results.

## Provider choice and readiness preparation — September 5, 2026

The owner authorized an optional OpenAI route alongside the default NVIDIA NIM/Cloudflare route, superseding the earlier restriction. The target is a persistent lesson-level selection with configured-model planning, factual review, decoded-frame review and repairs. Firecrawl, catalog retrieval, local Kokoro and Remotion remain shared. Exact implementation checks and live model evidence will be recorded separately; authorization and adapter code alone do not prove API access or lesson quality.

Refreshed the current README, phase status and plan; retained dated historical outcomes; prepared an updated owner demo runbook, submission working copy and a readiness checklist with a 3–5-person user-trial protocol. Rechecked the official event and Luma deadline: September 22 at noon Pacific. The VibeApps public form requires sign-in, so authenticated fields remain unverified. No participant trial, recording, OpenAI success, email receipt, social post, organizer response or final submission is claimed by this preparation step.

## Provider implementation and AgentMail setup — release 0.6.0

Implemented a persisted lesson-level provider selector: NVIDIA NIM + Cloudflare Workers AI remains the default; selected OpenAI lessons use the Responses API for planning, source review, decoded-frame review and repairs without silently switching providers. The model defaults to `gpt-5.4-mini` and is configurable through `OPENAI_MODEL`; `npm run openai:setup -- --prod` qualifies the production route after an operator supplies `OPENAI_API_KEY`. No local key was present, so there were no live OpenAI inference calls. Final test/build and deployment results remain in the release evidence report.

The final `npm run check` passed on 0.6.0: 109 tests across 13 files, TypeScript, ESLint, static app export and worker build. These checks use isolated provider responses; they do not turn the earlier five-topic result into a new model evaluation or prove live OpenAI inference or email receipt.

AgentMail's configured inbox returned HTTP 200 with a matching identity, resolving the earlier 403 blocker. Organization/inbox webhook lists were empty, so a production-only webhook was created for the intended endpoint/inbox and sent/delivered/bounced events. Its returned signing secret was saved to ignored configuration; `npm run delivery:setup -- --prod` completed successfully. No email was sent. Consented recipient verification, actual delivery, received links and callback acceptance remain pending.

The production 0.6.0 backend and static frontend deployed successfully. Public health returned HTTP 200 with generation enabled. Browser testing verified the NVIDIA/Cloudflare default, selectable OpenAI with a clear missing-key message and zero created jobs, then one default-route job entering live planning. Its topic is “Why does salt dissolve in water?”; the subsequent completed outcomes are recorded below. Both provider routes share the icon catalog; OpenAI resolves exact catalog entries, while the default route retains vector embeddings. This selector check is not a new completed-topic benchmark.

Runtime `0ebfce2` was pushed to public main and passed the clean-install Vercel check with 109 tests and complete builds. The media worker remained 0.5.6 with a fresh three-second heartbeat and seven capabilities. Desktop and 390-pixel mobile views had no horizontal overflow; changing the form selector and reloading did not change the active lesson's provider. A separate browser played the public solar result for 24 seconds with captions; metadata reported 60.053 seconds, 1280×720 and five sources. These are live behavior checks, not new user trials or a new held-out evaluation.

The salt regression's revision 1 finished rendering: 60.053 seconds, 1280×720 and captions. All four end boards were manually inspected; they were readable, mostly word cards, with no clipping. Source review rejected the unsupported high-melting-point clause in scene 1; the other three scenes passed. Automatic repair then failed after NVIDIA HTTP 502 and Cloudflare HTTP 429, a service/quota failure rather than a scene-schema failure. The result is unapproved. A bounded transient-retry correction and any explicit operator recovery must be recorded separately; they cannot erase the first-attempt failure or alter the earlier frozen evaluation.

The owner subsequently chose to leave OpenAI disabled for now. The implemented selector remains available with its safe unavailable message and zero-job behavior. Optional activation is outside the remaining implementation work; live OpenAI sponsor evidence is absent and must be disclosed in the event materials.

## Bounded repair correction — September 5, 2026

The repair correction retries the same request at most three times for transient service failures, with bounded 30/60-second waits. Authentication and schema failures are not treated as transient. Eight additional tests cover bounded attempts, failure classification and cancellation/replay safety; the complete local check passed 117 tests across 14 files, TypeScript, ESLint, static export and worker build. The backend correction deployed successfully. It does not add another creative repair round.

One explicit operator recovery resumed the original failed salt revision-1 repair request after the correction. It removed exactly “and high melting point” from scene 1. Structured comparison confirmed scenes 2, 3 and 4 were bit-identical for ID, layout, title, narration, nodes, takeaway and connections. No additional automatic repair request or requested-edit budget was created. This recovery is separate from the original automated failure; its final outcome is recorded below.

Final runtime `04c4635` was pushed to public main. Its Vercel validation is Ready after `npm ci`, 117 tests across 14 files, TypeScript, ESLint, static export and worker build for that exact commit. The initial `0ebfce2` Vercel result remains the 109-test selector release, not the validation count for this repair correction.

Final salt recovery outcome: revision 2 rendered for 60 seconds and all four factual checks passed. NVIDIA visual review rejected scene 1, demanding illustrated ions/lattice and directed arrows despite the supported text-card/association layout. The gate was not overridden. The draft is unapproved, sharing and email remain closed, and requested editing is still available. The original failure and the separate operator recovery are both non-approved outcomes; neither changes the frozen evaluation. Visual-review variability and limited word-card presentation remain known limitations. No further live attempt or tuning is running for this topic. Solar remains the sole manually qualified public example. The development backend is also synced to the final runtime.
