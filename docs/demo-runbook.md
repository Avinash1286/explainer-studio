# Owner-recorded hackathon demo

Target: **2 minutes 40 seconds**, below the official three-minute limit. The owner records the actual deployed app at https://wooden-pheasant-677.convex.site/. Keep the browser's creator workspace; clearing browser storage loses its private lessons.

The manually inspected solar example is available at https://wooden-pheasant-677.convex.site/lesson/index.html?example=solar-cells . Its public gallery view is read-only. Generate an owned lesson before recording to demonstrate editing and sharing. The solar example was made using the earlier NVIDIA/Cloudflare route; do not present it as OpenAI output.

Current preparation: release 0.6.0 frontend/backend are deployed, provider selection is browser-verified and the full local check passes (109 tests plus types, lint and builds). OpenAI defaults to configurable `gpt-5.4-mini`; there is no local key or real OpenAI result yet. The deployed missing-key attempt creates no job. AgentMail inbox access and its production webhook are configured successfully; an authorized recipient verification/delivery test is still pending. Neither a configured service nor a rehearsal closes those live demonstration gates.

## Before recording

1. Complete the relevant [readiness gates](hackathon-readiness.md). Check public playback, generation availability and the worker heartbeat using [release operations](release-operations.md).
2. Choose an introductory science/mechanism question. After the OpenAI route passes live qualification, select OpenAI for the owned example intended to demonstrate that sponsor. If it is unavailable, preserve the honest failure and use the verified default route for the product rehearsal; do not imply OpenAI output exists.
3. Wait for approval, then inspect the complete video, narration, captions, source links and diagrams yourself. Record the lesson's selected provider, exact version and deployed commit in private recording notes. Keep credentials and creator tokens out of those notes and the screen capture.
4. Keep an owned approved result, source/review panel and a previously completed targeted revision ready. Use a separate browser session for the share link.
5. Only demonstrate AgentMail after a consented verification and delivery test actually reaches the recipient and its links work. Email can be omitted from an early rehearsal, but its unproven sponsor role remains a submission gap.
6. Rehearse once with a timer. Turn off personal notifications and close pages that show keys, private addresses or administration credentials.

## Suggested recording

| Time | Screen and narration |
|---|---|
| 0:00–0:15 | Play a finished lesson. “A question becomes a researched, narrated explanation you can inspect and revise.” |
| 0:15–0:35 | Enter the topic, duration and audience. Show the provider choice, select the qualified route, and submit. Show real progress. |
| 0:35–1:00 | Switch to the prepared owned result. “Generation takes several minutes; this example finished earlier.” Play a short segment with narration and captions. |
| 1:00–1:25 | Show source links and review findings. Explain that Convex persists each stage and sharing waits for factual and decoded-frame checks. Identify the actual provider used by this result. |
| 1:25–1:50 | Request one specific scene edit. Show a previously completed revision if rendering is still running, explicitly labelling the time jump. Explain that unchanged scenes can reuse narration and the changed version is reviewed again. |
| 1:50–2:15 | Create a share link, open it in the separate browser and play it. If AgentMail has passed its acceptance test, show the received lesson link while hiding personal addresses and tokens. |
| 2:15–2:40 | Show the repository or simple architecture: Convex coordinates Firecrawl, the selected model provider and the Zerops Kokoro/Remotion worker. State the supported scope and end with the public app URL. |

Be precise about the provider used by each clip. The OpenAI option shares research, assets, narration and rendering with the default route; choosing it does not create OpenAI-generated audio or artwork. Do not claim zero failures, perfect accuracy, instant generation, a received email or official eligibility without evidence. Disclosed cuts to remove waiting are fine.

## Recording acceptance

- The file plays from start to end, is under three minutes and has intelligible narration.
- Text and source/review panels are readable at the submitted resolution.
- Prepared results and elapsed-time cuts are labelled; no failed or unapproved draft is presented as a finished result.
- Any OpenAI or AgentMail claim is tied to actual release evidence.
- The video URL is publicly accessible in a fresh browser, without the owner's account.
- Add the real video URL to root `hackathon.md` and [submission draft](submission-draft.md), together with the demonstrated commit/deployment.

## Final submission materials

The [readiness checklist](hackathon-readiness.md) covers the repository, build log, public app, real user trials, social post and participant checks. Use the [VibeApps form](https://vibeapps.dev/judging/convex-all-gas-hackathon-openai/submit); the current authenticated fields remain to be inspected. A recording runbook is preparation, not a recorded or submitted video.
