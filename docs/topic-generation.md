# H2: topic-to-video pipeline

Development provider qualification passed using the owner's configured credentials. Full topic-to-video acceptance is in progress; production generation remains gated until that test passes.

## Pipeline

1. The browser saves a session-owned lesson brief and starts generation when the service reports ready. Existing briefs have a separate start button. Start is idempotent; creation quotas are shared with demo jobs and active generation is capped at five jobs.
2. Convex Workflow runs a Firecrawl v2 search with main-content Markdown. It requires at least two HTTPS sources on different hostnames and stores up to five bounded excerpts.
3. NVIDIA Nemotron 3 Super 120B A12B plans four, five or six scenes for 60, 75 or 90 seconds. A duration-specific schema requires 27-36 narration words per scene, a supported layout with the correct node count, and concepts from the available icon vocabulary. The model selects short exact quotations from a topic-ranked excerpt catalog. Source/quote pairs are checked against the original research. The compiler aligns cue inflections, label words and sunlight aliases to spoken words, then orders nodes by their cue. Unresolved or repeated cues fail validation. At least two sources and two layout families are required.
4. Cloudflare BGE base embeds scene concepts in a pinned 768-dimensional, mean-pooled space. Convex vector search retrieves up to three icons per concept from the 24-asset licensed catalog. A text model selects only from those candidates. Missing candidates fail the plan rather than substituting unrelated assets.
5. The immutable project and provenance enter the existing Convex media queue. A protocol-2 Zerops worker runs Kokoro, adjusts audio tempo within 0.8-1.25 of the original, distributes 0.7-2.5-second scene holds, compiles an exact 60/75/90-second timeline and renders MP4, captions, poster and project metadata. A shorter voice recording uses bounded pauses instead of exceeding the slowdown limit.

Completed steps are persisted as research, plan and project checkpoints. A replay reuses those artifacts. Cancellation stops the workflow and prevents late checkpoint writes and publication. Firecrawl and embedding steps get at most two workflow attempts; planning has up to two validation repairs per provider. An authenticated operator can resume a failed pre-render plan with `generation:resumePlanning`; it reuses research and refuses jobs that already have a plan/project checkpoint. If a process dies after a provider responds but before checkpoint persistence, that external call may be repeated. Exactly-once billing is not claimed.

## Text fallback

NVIDIA uses the hosted OpenAI-compatible endpoint with JSON mode and a guided schema. Cloudflare uses Workers AI REST with a JSON schema. Both outputs pass the same local Zod and semantic-structure checks; provider decoding is not trusted as a substitute for validation. Primary 429, 408, network failures or 5xx responses switch to Cloudflare. Credential failures stop promptly. Invalid model output gets up to two repairs with the preceding candidate and concise validation errors in a separate conversation turn, then stops.

Qualification exercises a real primary request and a real backup request behind an injected primary 429. This proves router behavior without deliberately exhausting the account's rate limit. It does not claim that a naturally occurring upstream 429 was observed. Cross-job circuit-breaker cooldown and calibrated semantic retrieval thresholds remain future tuning work.

## Add credentials after implementation

Create or edit `.env` in the repository root, `F:/cai/explainer-studio`, with:

```dotenv
NVIDIA_API_KEY=
FIRECRAWL_API_KEY=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

The Cloudflare token needs Workers AI access for that account. Keep `.env` ignored. None of these values may use a `NEXT_PUBLIC_` prefix.

```sh
npm run providers:setup
```

The command reads `.env`, uploads only those four variables to the selected development Convex deployment via stdin, disables generation during qualification, probes both text providers and Firecrawl, builds the icon embedding index, then enables generation only if everything succeeds. It relies on existing Convex CLI authentication. It never passes secrets through shell interpolation or command-line arguments. It does not overwrite the media worker credential.

After a real development topic-to-video test passes:

```sh
npm run providers:setup -- --prod
```

This explicitly targets production. Filling `.env` alone does not configure cloud functions. The worker needs only its existing scoped Convex token; model keys remain in Convex.

Use `npm run providers:setup -- --prod --keep-disabled` to qualify production while retaining the generation gate for content acceptance. The operator-only `media:retryFailed` allows one additional attempt after a worker fix, preserving the monotonic lease counter so stale workers remain fenced.

For manual qualification without copying local configuration:

```sh
npx convex run icons:qualify '{}'
```

The qualification action is internal and accessible through authenticated administration, not public browser code. Check its `passed` field; a zero CLI exit status alone does not establish success.

## Verification and remaining gate

The isolated test suite runs real Convex workflow/component logic with simulated provider HTTP responses. It covers primary rate-limit fallback, bounded repair, bad credentials, malformed embeddings, insufficient research, invented citations, cue/layout constraints, excerpt selection, checkpoint replay, operator recovery, owner isolation, failure completion, cancellation and protocol-2 media handoff. The current suite has 41 passing tests, including the observed short-narration timing case and HTTP renewal after operator recovery.

A separate real Kokoro/Remotion render produced 1440 frames (60 seconds, 1280 x 720, H.264/AAC) in 120.76 seconds on the local Windows machine, using a manually authored test project. Audio fit and predicted word bounds passed; all four boards were sampled visually. See `topic-render-benchmark.json` and `topic-render-verification.json`. It is labelled scripted renderer validation. It is not evidence of live AI topic generation.

The backend and frontend are deployed. Zerops reports worker version `0.3.0` with `generated-v1` capability and a successful readiness check. Browser save/reload/cancel and the disabled-generation setup state passed on desktop and mobile. GitHub Actions is now disabled and its workflow removed. Vercel Git integration on Hobby runs the complete validation command; its first build passed for commit `347bb57`. See [continuous validation](continuous-validation.md).

Live provider checks passed for NVIDIA text, real Cloudflare fallback behind an injected primary 429, Firecrawl research and 24 Cloudflare icon embeddings. See `provider-qualification-development.json`. The original NVIDIA Llama endpoint returned HTTP 410, prompting the model update. A complete plan passed a saved-research diagnostic; initial browser runs exposed cue and schema reliability issues that led to the compiler and constrained-planning fixes above. The remaining H2 gate is a completed browser topic-to-video run, content/playback inspection and production qualification. H3 adds semantic/frame review, bounded revision and opt-in delivery.

## Limits

- English only; 24 licensed icons and three diagram layouts constrain topic coverage.
- Exact source-quote matching proves traceability, not that every narration claim is entailed by its citation. Source selection quality and semantic review need live evaluation and H3.
- Kokoro word times remain predictions; tempo adjustment scales them and does not constitute forced alignment.
- Provider/model candidates are fixed in `packages/contracts/generation.ts`. Changing embedding models, pooling or catalog semantics requires a new embedding-space version and rebuild.
- Research excerpts are internal. The browser shows source links; the exported companion includes bounded supporting quotations, source mapping, provider attempts and icon retrieval diagnostics.
- Storage URLs are bearer links. Media recovery restarts a full project. Existing H1 upload and access limitations still apply.

## Primary documentation checked

- Cloudflare text model: https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
- Cloudflare JSON mode: https://developers.cloudflare.com/workers-ai/features/json-mode/
- Embedding model/dimensions/pooling: https://developers.cloudflare.com/workers-ai/models/bge-base-en-v1.5/
- Firecrawl search response and Markdown: https://docs.firecrawl.dev/api-reference/endpoint/search
- NVIDIA hosted APIs: https://docs.api.nvidia.com/nim/reference/llm-apis
- NVIDIA selected model: https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b
- NVIDIA structured generation: https://docs.nvidia.com/nim/large-language-models/1.15.0/structured-generation.html
- Convex Workflow API: installed `@convex-dev/workflow` 0.4.6 README and TypeScript declarations.
