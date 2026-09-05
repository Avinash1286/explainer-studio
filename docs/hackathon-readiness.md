# Hackathon readiness

Checked September 5, 2026. **The app is available; the complete hackathon entry is not yet finished.** This checklist separates the deployed baseline, the provider update, product acceptance and external submission steps. [Release evidence](release-evidence.md) is the source for measured results; [release operations](release-operations.md) contains configuration and recovery procedures.

## Product and provider evidence

| Gate | Status | Evidence needed to close |
|---|---|---|
| App and hosting | 0.6.0 backend/static frontend deployed; public health HTTP 200 with generation enabled | Record final source commit and Git/Vercel result; retain separate media-runtime evidence |
| Automated validation | 0.6.0 passed `npm run check`: 109 tests across 13 files, TypeScript, ESLint, static export and worker build | Preserve the exact tested source revision and verify final remote Git validation |
| Five-topic evaluation | 4/5 automatic approvals on the frozen baseline; manual limitations retained | Do not relabel this 5/5 after the separate bicycle replay, or count it as user testing |
| Provider selector and persistence | Implemented and browser-verified on production: default NVIDIA/Cloudflare; missing-key OpenAI attempt created zero jobs; switching to default created one job and began planning | Keep real-model output and revision qualification separate from selector and isolated persistence checks |
| Real OpenAI product use | No local API key; no live inference | Supply `OPENAI_API_KEY`, qualify configured `OPENAI_MODEL` (default `gpt-5.4-mini`), then record real planning, source/frame review and a revision/repair; inspect the resulting video |
| Default provider regression | New production topic accepted and planning began; earlier route/fallback qualification retained | Record the new lesson's final video and inspection outcome; starting planning is not completion |
| AgentMail delivery | Configured-inbox GET returned HTTP 200 with matching identity; production-scoped webhook and signing secret configured successfully | Obtain consent for recipient verification and lesson delivery; verify the received message, usable links, duplicate trigger and callbacks |
| Manual showcase quality | Solar revision 3 inspected and public | Inspect the exact provider-qualified lesson used in the final demo; remove unresolved factual, label, relationship or timing defects |
| Real user trials | None recorded | Complete 3–5 trials and apply at least one evidence-based improvement, as required by the project plan |

The 0.6.0 OpenAI option supersedes the older restriction on OpenAI inference. Run `npm run openai:setup -- --prod` after adding the operator's key and optional model override to ignored configuration. Both routes share Firecrawl research, the icon catalog, Kokoro speech and Remotion rendering. OpenAI resolves icons against the exact catalog; the NVIDIA/Cloudflare route retains its vector embeddings. Code, credentials being present, isolated provider mocks and a dropdown label do not establish actual sponsor usage.

AgentMail's earlier 403 is resolved. Existing organization/inbox webhook lists were empty before a production-only webhook was created for the configured inbox and `message.sent`, `message.delivered` and `message.bounced` events. Its returned signing secret was saved privately and `npm run delivery:setup -- --prod` succeeded. No email has been sent; configured callbacks do not establish receipt. Keep any remaining sponsor compliance gap explicit until real product evidence or organizer clarification exists.

## Official entry requirements

The [official All Gas event page](https://www.convex.dev/hackathons/all-gas) requires a public repository, root `hackathon.md`, accessible `convex.site`/`chatgpt.site` app and demo under three minutes. It calls for real OpenAI, Firecrawl and AgentMail product functions and an X/LinkedIn post tagging @convex, @OpenAI, @firecrawl and @agentmail. The deadline is **September 22, 2026, 12:00 PM Pacific — September 23, 00:45 Nepal time**.

The [organizer's Luma page](https://luma.com/convex-allgas-hackathon) supplies registration and personal eligibility terms, including the new-app start boundary and team rules. The participant must check those terms and their own eligibility; this checklist does not attest to either. Record actual implementation dates from the repository history.

| Submission item | Current state | Owner action/evidence |
|---|---|---|
| Public repository | Existing GitHub repository | Confirm final branch is public and contains the demonstrated release |
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

- Application deployment: Convex backend/static frontend 0.6.0 verified; exact demonstrated source commit and final Git/Vercel outcome pending.
- Provider/model and accepted lesson evidence: pending for the OpenAI update.
- AgentMail received-message and callback evidence: pending.
- Trial summary and improvement: pending.
- Public video URL and duration: pending owner recording.
- Public social-post URL: pending.
- Participant registration and terms check: pending owner confirmation.
- Submitted URL, receipt and timestamp: pending actual submission.

The owner-recorded [demo runbook](demo-runbook.md) and [submission copy](submission-draft.md) are ready to fill from those observations. No trial, email, social post, eligibility decision or submission is implied by a prepared document.
