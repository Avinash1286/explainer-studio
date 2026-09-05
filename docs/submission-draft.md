# Submission working copy

Draft only. Replace evidence-dependent items after real validation; this file is not an event entry. Use [release evidence](release-evidence.md) for measured results and [hackathon readiness](hackathon-readiness.md) for open gates.

**Project:** Explainer Studio

**One sentence:** Turn a question into a source-backed illustrated video, with narration, captions, targeted revisions and an inspectable approval trail.

**Problem:** A short explanation usually requires research, a script, illustrations, voice work and editing across separate tools. Keeping the explanation accurate while coordinating those steps is harder than generating a fluent script.

**Approach:** A Next.js/TypeScript app sends a topic to durable Convex workflows. Firecrawl supplies research. The verified NVIDIA NIM/Cloudflare route plans the explanation and checks claims and rendered frames. Release 0.6.0 adds a selectable OpenAI Responses route for those stages and targeted repairs, using a configurable model (default `gpt-5.4-mini`). Its implementation is complete; live qualification still needs an API key and must be recorded before submission. Canonical icons and word cards compile into deterministic diagrams. A Zerops worker runs local Kokoro-82M, Remotion and FFmpeg to produce video, captions and frame evidence. Source and visual review gate publication. Owners can revise a scene, inspect findings and share an approved version.

**Why Convex matters:** The database is the persistent coordination layer: research checkpoints, realtime progress, lease fencing, immutable versions, reviewer findings, retries, quotas, sharing and the email outbox all survive beyond a browser request.

**Intended audience:** Students, educators and curious people exploring introductory science and everyday mechanisms in 60–90 seconds.

**What is distinctive:** The output includes evidence and version-bound review, and a requested scene change can preserve the other scenes and reuse their narration. Deterministic diagrams make individual concepts and relationships inspectable.

**Known limits:** The small icon catalog often falls back to word cards. Generated diagrams and review verdicts can still be wrong; users should inspect the complete lesson. The frozen baseline evaluation yielded 4/5 automated approvals with manual visual limitations, not four polished showcase videos or independent user trials. Generation takes several minutes and can fail when providers time out or exhaust quota.

**Validation:** Release 0.6.0 passes 109 automated tests across 13 files, TypeScript, ESLint, static export and worker build. The Convex frontend/backend are deployed; the provider selector and unavailable-OpenAI behavior are browser-verified, and a fresh default-route lesson began planning. Its final video and the final Git/Vercel result remain pending. Live OpenAI output, consented email receipt and real user trials are separate pending evidence.

## Links to enter in the form

| Field | Current value |
|---|---|
| Public app | https://wooden-pheasant-677.convex.site/ |
| Public source | https://github.com/Avinash1286/explainer-studio |
| Build log | https://github.com/Avinash1286/explainer-studio/blob/main/hackathon.md |
| Manually inspected example | https://wooden-pheasant-677.convex.site/lesson/index.html?example=solar-cells |
| Demo video | OWNER TO ADD after recording and upload |
| Social post | OWNER TO ADD after the actual post |
| Real user feedback | OWNER TO ADD after actual trials |
| Demonstrated commit/deployment | ADD the exact versions used in the recording |
| Submission receipt | NOT SUBMITTED BY THIS TASK |

## Sponsor evidence to finalize

| Product role | Evidence available | Still required |
|---|---|---|
| Convex coordination and hosting | Public app, real generation/revision/share evidence and root log | Recheck final deployed version and links before submitting |
| Firecrawl research | Live qualification and stored sources used by generated lessons | Show one source-backed lesson in the recording |
| OpenAI model option | 0.6.0 route implemented; `OPENAI_API_KEY` is absent locally, so no live inference is claimed | Configure and qualify the model; record real planning, factual/image review and revision/repair output; do not substitute Codex-assisted development for product inference |
| AgentMail completion delivery | Outbox/verification implemented; configured-inbox GET returned HTTP 200 and identity matched; production webhook and signing secret configured | Consented recipient verification and a received-message test with working links and callback evidence; no email has been sent |

The previous decision to exclude OpenAI inference is superseded. If the final submission still lacks real OpenAI or AgentMail usage, disclose that gap and obtain organizer clarification rather than asserting compliance with the sponsor-stack criterion. No organizer question has been sent by this task.

## Social copy for owner review

Draft, not posted:

> Building Explainer Studio: one question becomes a researched, narrated lesson you can inspect, revise and share. Convex coordinates the work, Firecrawl supplies research, and Kokoro + Remotion turn the explanation into video. Try it: https://wooden-pheasant-677.convex.site/ @convex @OpenAI @firecrawl @agentmail

After qualification, add a short, factual sentence about the OpenAI option and AgentMail delivery with a demonstration link. Sponsor tags alone are not evidence that the corresponding service ran in the product.

## Event and final entry

Official requirements checked September 5, 2026: submit a public repository, root `hackathon.md`, accessible `convex.site`/`chatgpt.site` app and a demo under three minutes. Include the event's tagged X/LinkedIn post. The deadline is **September 22, 2026 at 12:00 PM Pacific**, which is **September 23 at 00:45 Nepal time**. [Official event](https://www.convex.dev/hackathons/all-gas).

Use the [exact VibeApps submission page](https://vibeapps.dev/judging/convex-all-gas-hackathon-openai/submit). Its public page requires sign-in; authenticated fields and attestations still need inspection by the participant. The owner must verify [Luma registration and participant terms](https://luma.com/convex-allgas-hackathon). No final entry, social post, demo upload or eligibility attestation has been made by this task.
