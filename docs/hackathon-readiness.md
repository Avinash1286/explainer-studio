# Hackathon readiness

Checked September 5, 2026. **The app is available; the complete hackathon entry is not yet finished.** This checklist separates the deployed baseline, the provider update, product acceptance and external submission steps. [Release evidence](release-evidence.md) is the source for measured results; [release operations](release-operations.md) contains configuration and recovery procedures.

## Product and provider evidence

| Gate | Status | Evidence needed to close |
|---|---|---|
| App and hosting | 0.6.0 deployed, development backend synced, final runtime `04c4635` on public main; Vercel Ready; worker 0.5.6 heartbeat observed three seconds old with seven capabilities | Recheck availability before recording and preserve the demonstrated version |
| Automated validation | Final `04c4635` passed local and clean-install Vercel checks: 117 tests across 14 files, types, lint, web/worker builds | Complete; repeat for subsequent runtime changes |
| Five-topic evaluation | 4/5 automatic approvals on the frozen baseline; manual limitations retained | Do not relabel this 5/5 after the separate bicycle replay, or count it as user testing |
| Provider selector and persistence | Production browser verified default route, zero-job missing-key OpenAI attempt, one default-route job and its persisted provider after form changes/reload; desktop/390-pixel mobile without overflow | Keep real-model output and revision qualification separate from selector and isolated persistence checks |
| Real OpenAI product use | Intentionally disabled at the owner's request; implemented option safely reports unavailable; no live inference | Not required to complete this implementation. Disclose missing sponsor usage and clarify event eligibility; qualify real output only if the owner later enables the route |
| Default provider regression | Finished, not approved: salt revision 1 failed source review and repair hit service/quota errors. One operator recovery removed only the unsupported phrase and preserved scenes 2–4 content; revision 2 rendered and passed all four factual checks but failed visual review | Retain both failures. The draft stays editable with sharing/email closed; solar remains the only qualified public example |
| AgentMail delivery | Configured-inbox GET returned HTTP 200 with matching identity; production-scoped webhook and signing secret configured successfully | Obtain consent for recipient verification and lesson delivery; verify the received message, usable links, duplicate trigger and callbacks |
| Manual showcase quality | Solar revision 3 previously inspected; independent-browser playback advanced 24 seconds with captions, 60.053-second 1280×720 file and five sources | Inspect the exact provider-qualified lesson used in the final demo; remove unresolved factual, label, relationship or timing defects |
| Real user trials | None recorded | Complete 3–5 trials and apply at least one evidence-based improvement, as required by the project plan |

The 0.6.0 OpenAI option is implemented, and the owner has explicitly chosen to leave it disabled. Its safe unavailable state is the intended current behavior, not unfinished configuration work for this implementation. If the owner later enables it, use the setup procedure in release operations and qualify the configured model. Both routes share Firecrawl research, the icon catalog, Kokoro speech and Remotion rendering. OpenAI resolves icons against the exact catalog; the NVIDIA/Cloudflare route retains its vector embeddings. Code and a dropdown label do not establish live sponsor usage.

AgentMail's earlier 403 is resolved. Existing organization/inbox webhook lists were empty before a production-only webhook was created for the configured inbox and `message.sent`, `message.delivered` and `message.bounced` events. Its returned signing secret was saved privately and `npm run delivery:setup -- --prod` succeeded. No email has been sent; configured callbacks do not establish receipt. Keep any remaining sponsor compliance gap explicit until real product evidence or organizer clarification exists.

The salt recovery's NVIDIA visual reviewer demanded illustrated ions/lattice and directed arrows for scene 1 despite the supported word-card/association layout. This exposes variable visual judgments and presentation limits. The gate was not overridden; neither salt attempt counts as an approved result or changes the frozen five-topic evaluation. This topic's verification run is finished, with no further tuning or live attempts in progress.

## Official entry requirements

The [official All Gas event page](https://www.convex.dev/hackathons/all-gas) requires a public repository, root `hackathon.md`, accessible `convex.site`/`chatgpt.site` app and demo under three minutes. It calls for real OpenAI, Firecrawl and AgentMail product functions and an X/LinkedIn post tagging @convex, @OpenAI, @firecrawl and @agentmail. The deadline is **September 22, 2026, 12:00 PM Pacific — September 23, 00:45 Nepal time**.

The [organizer's Luma page](https://luma.com/convex-allgas-hackathon) supplies registration and personal eligibility terms, including the new-app start boundary and team rules. The participant must check those terms and their own eligibility; this checklist does not attest to either. Record actual implementation dates from the repository history.

| Submission item | Current state | Owner action/evidence |
|---|---|---|
| Public repository | Final runtime commit `04c4635` pushed to public main | Preserve the demonstrated release; record later changes separately |
| Root build log | Exists; current summary and historical entries maintained | Add actual video, provider proof and final deployment details |
| Public app | https://wooden-pheasant-677.convex.site/ | Fresh-browser check of final result, sources, captions, generation and shares |
| Demo video | Runbook prepared; owner recording pending | Record, upload, verify public playback and save URL |
| Social post | Draft prepared; no post recorded | Publish approved copy and save the actual URL |
| Registration/eligibility | Unverified | Participant checks the official terms and Luma registration |
| VibeApps form | Public page requires sign-in | Inspect required fields and attestations in the authenticated form |
| Final entry | No submission receipt recorded | Submit complete materials and save receipt, timestamp and submitted URLs |

Submit using the [exact VibeApps event form](https://vibeapps.dev/judging/convex-all-gas-hackathon-openai/submit). Additional authenticated form fields are unverified. Aim to finish by **September 21 at 20:00 Nepal time**, retaining the plan's buffer. Real user trials are a project-plan gate; they were not found as a separate mandatory field in the public event checklist.

## User trial protocol

Use 3–5 actual students, educators or curious learners. Give each the public app and a supported question of their own. Observe without doing the task for them. A trial is complete when the person has tried generation, watched the full result, checked sources and attempted a targeted revision or share. Record failures as outcomes; a preloaded gallery video alone is not a generation trial. Email testing is optional for a participant and requires consent.

Use anonymous participant labels in repository notes. Do not commit names, email addresses, creator tokens, private lesson capabilities or recordings of people. Quote feedback publicly only with the person's permission.

| Trial | Audience / question | Provider / exact build | Outcome and time | Accuracy / visual issue | Usability feedback | Resulting change / recheck |
|---|---|---|---|---|---|---|
| T1 | Pending real participant | Pending | Pending | Pending | Pending | Pending |
| T2 | Pending real participant | Pending | Pending | Pending | Pending | Pending |
| T3 | Pending real participant | Pending | Pending | Pending | Pending | Pending |
| T4 (optional) | Pending real participant | Pending | Pending | Pending | Pending | Pending |
| T5 (optional) | Pending real participant | Pending | Pending | Pending | Pending | Pending |

Ask: What did the lesson explain clearly? Which label or relationship was confusing or wrong? Did source links help assess it? Could you tell whether the result was ready? Could you make the intended edit and share the approved version? Would you use it again, and for which question?

## Submission handoff record

Populate only after the corresponding event occurs:

- Initial selector deployment: runtime [`0ebfce2`](https://github.com/Avinash1286/explainer-studio/commit/0ebfce2); [Vercel validation](https://explainer-studio-checks-9705f7ydg-avinash1286s-projects.vercel.app) Ready after a clean install, 109 tests and builds.
- Final repair runtime: [`04c4635`](https://github.com/Avinash1286/explainer-studio/commit/04c4635), production/development backends synced; [Vercel validation](https://explainer-studio-checks-1ryoohj3q-avinash1286s-projects.vercel.app) Ready after exact-commit clean install, 117 tests and full builds. Operator recovery rendered and passed factual checks but failed visual review; final status is unapproved.
- OpenAI product-use evidence: absent by the owner's choice to leave the implemented route disabled; sponsor eligibility clarification remains pending.
- AgentMail received-message and callback evidence: pending.
- Trial summary and improvement: pending.
- Public video URL and duration: pending owner recording.
- Public social-post URL: pending.
- Participant registration and terms check: pending owner confirmation.
- Submitted URL, receipt and timestamp: pending actual submission.

The owner-recorded [demo runbook](demo-runbook.md) and [submission copy](submission-draft.md) are ready to fill from those observations. No trial, email, social post, eligibility decision or submission is implied by a prepared document.
