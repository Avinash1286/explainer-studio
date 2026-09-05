# H3: review, revision and delivery

Implementation is present in release 0.4.0. **Live OpenAI review, successful automatic repair and real email acceptance remain pending credentials.** Production topic generation stays disabled. The four H2 provider keys remain configured. GitHub Actions remains disabled; Vercel Hobby runs `npm run check` on pushes.

## Rendered evidence and publication

Worker protocol 3 decodes two JPEGs from each completed MP4, at 45% and 90% of each scene. It uploads them through the existing fenced, authenticated artifact protocol. Generated tasks require complete per-scene frame coverage, distinct registered storage objects and JPEG size/type validation. The critic checks their frame numbers against the timed project and verifies that the rendered project matches the immutable requested version. These are frames from the video, not separately generated illustrations.

Convex saves the complete version and starts a durable review workflow. The OpenAI Responses adapter sends the actual frame URLs, narration, icon catalog and original Firecrawl text, with `store: false` and structured output. The pinned default is `gpt-4.1-2025-04-14`; set `OPENAI_REVIEW_MODEL` to an explicitly qualified alternative if needed. Model response ID, model name, usage, scene findings and verdict are persisted. Original evidence quotations alone do not count as factual support: the critic is instructed to assess whether sources support the claims. Known live category errors (leaf/pollen, leaf/ovule, seedling/seed and globe/soil) also have deterministic guards.

Only a passing stored review makes a generated version eligible for email/share delivery. Owners can play rejected or unavailable drafts, clearly labelled unapproved. Legacy H2 generated results are unapproved until migrated and reviewed. The fixed demo remains explicitly labelled and uses its established validation path.

The critic receives at most two API attempts per review workflow, with a 90-second request deadline. Refusal, missing frames, malformed output or provider failure leaves a saved, unapproved draft. No other provider is presented as OpenAI review. Sampling cannot prove the quality of every frame or of the audio; human content acceptance still matters.

## Bounded changes

One automatic repair round per lesson targets the scenes rejected by the critic. A rejection across several scenes may replace all affected scenes in that single round. NVIDIA/Cloudflare perform the repair using supplied sources and catalog assets. Validation preserves project metadata, scene order and every unaffected scene, constrains narration length and cue order, and checks exact evidence quotations. Repaired media passes through the same independent review again. Another rejection stops automatic repair.

Owners can request up to two additional one-scene edits, separately counted. Owner authorization, expected revision and request IDs prevent stale or duplicated edits. Late review/repair results cannot overwrite a cancelled or newer version. Archived project/result records retain older versions; an email share stays pinned to the version that passed review.

Kokoro caches raw scene audio and predicted word timings by narration, voice, speed and cache/model version. Unchanged narration is reused on the same worker. The cache checks the WAV hash and is capped at about 500 scene records. A worker restart/redeployment may lose this optional cache. The complete video is still re-encoded; global narration fitting may retime reused raw speech. This is not incremental MP4 rendering or cross-worker shared caching.

## Verified opt-in email

The owner explicitly requests a verification message, pastes its 256-bit code into the same workspace, then separately consents to email the approved lesson. Codes expire after 15 minutes and five incorrect attempts; verification lasts seven days. Requests are limited per workspace, per address and globally. Code-bearing outbox bodies are erased after expiry.

Convex creates one outbox entry per lesson version and recipient. The immutable JSON body, sending inbox and stable `Idempotency-Key` are reused through at most three send attempts. All retries finish within one hour (verification within 15 minutes), below AgentMail's documented 24-hour idempotency lifetime. An ambiguous failure is labelled `unknown` and is not retried indefinitely. No test email is sent by setup or by the test suite.

The HTTPS webhook verifies the exact raw body using Svix before parsing. It checks the sending inbox, records event IDs, and applies monotonic sent/delivered/bounced transitions. A callback arriving before the send acknowledgement gets a retryable 503. Delivered means acceptance by the receiving mail server, not proof that the message reached the inbox or was read.

Email links open a static Next.js lesson page backed by a hashed 256-bit share capability. Anyone holding that link can view the approved version for seven days; it carries no workspace credential. Scheduled expiry removes the share and invalidates cached queries. The page includes playback, captions, sources and OpenMoji attribution. Email failures do not change video approval or availability in the owner's workspace.

## Setup and remaining acceptance

Add these to ignored `.env`, then run `npm run review:setup` (development) or `npm run review:setup -- --prod` (production):

```dotenv
OPENAI_API_KEY=
OPENAI_REVIEW_MODEL=gpt-4.1-2025-04-14
AGENTMAIL_API_KEY=
AGENTMAIL_INBOX_ID=
AGENTMAIL_WEBHOOK_SECRET=
```

Register `message.sent`, `message.delivered` and `message.bounced` in AgentMail, targeting the matching deployment's `/api/webhooks/agentmail` endpoint. Development and production webhooks have separate signing secrets: configure one target at a time with its matching secret. Credentials remain in Convex; the renderer and Vercel do not receive them. Setup intentionally leaves generation disabled and does not send messages.

An operator can resume a saved unavailable review with `reviews:retryUnavailable` using its job ID and current revision after credential setup. `reviews:upgradeLegacy` re-renders a completed pre-H3 draft into a new revision with frame evidence, preserving the earlier version and research. Both are internal functions. They do not imply a passing content review.

Before enabling production: run real review on the known flawed draft; observe rejection, one bounded repair and a passing result or explicit final rejection. Then review a fresh topic and test a user-requested revision. From the UI, explicitly consent to a test recipient, verify it, send the lesson, inspect the actual inbox and follow its share/source links. Inject a duplicate send/webhook and confirm one logical delivery. H4 then evaluates five unseen topics and user comprehension.

## API references checked

- [OpenAI image input](https://developers.openai.com/api/docs/guides/images-vision), [structured output](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-4.1 snapshot](https://developers.openai.com/api/docs/models/gpt-4.1).
- [AgentMail send](https://docs.agentmail.to/api-reference/inboxes/messages/send), [idempotent sends](https://docs.agentmail.to/idempotency), [signature verification](https://docs.agentmail.to/webhook-verification), [delivery events](https://docs.agentmail.to/events).
- The installed Svix 2.3.0 implementation returns `undefined` after successful verification; JSON parsing follows verification. The signed-webhook regression test exercises this actual library behavior.
