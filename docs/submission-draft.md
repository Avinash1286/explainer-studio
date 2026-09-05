# Submission working copy

**Project:** Explainer Studio

**One sentence:** Turn a question into a source-backed illustrated video, with narration, captions, targeted revisions and an inspectable approval trail.

**Problem:** A short explanation usually requires research, a script, illustrations, voice work and editing across separate tools. Keeping the explanation accurate while coordinating those steps is harder than generating a fluent script.

**Approach:** A Next.js/TypeScript app sends a topic to durable Convex workflows. Firecrawl supplies research. NVIDIA NIM plans and verifies claims, with Cloudflare Workers AI as backup. Qualified icon embeddings live in Convex; canonical icons and word cards compile into deterministic diagrams. A Zerops worker runs local Kokoro-82M, Remotion and FFmpeg to produce video, captions and frame evidence. Source and visual review gate publication. Owners can revise a scene, inspect findings and share an approved version.

**Why Convex matters:** The database is the persistent coordination layer: research checkpoints, realtime progress, lease fencing, immutable versions, reviewer findings, retries, quotas, sharing and the email outbox all survive beyond a browser request.

**Links:**
- App: https://wooden-pheasant-677.convex.site/
- Source: https://github.com/Avinash1286/explainer-studio
- Build log: https://github.com/Avinash1286/explainer-studio/blob/main/hackathon.md
- Demo video: OWNER TO ADD
- User feedback: OWNER TO ADD after actual trials

**Accuracy of claims:** Use the release evidence report for current pass/fail counts. Do not claim AgentMail live delivery before the credential/consent test is completed. Do not claim automatic approval is a guarantee of scientific correctness.

**Eligibility question for organizers:** “Our app uses Convex, Firecrawl, NVIDIA NIM, Cloudflare Workers AI and an implemented AgentMail integration awaiting working credentials. Our selected models exclude OpenAI. Can this compete for overall or sponsor prizes under the All Gas sponsor-stack criterion?” Obtain a real answer before claiming eligibility. This draft does not imply that a question has been sent.

**Social draft (not posted):** “Building Explainer Studio: one question becomes a researched, narrated video you can inspect, revise and share. Convex coordinates the workflow; Firecrawl supplies research; NVIDIA and Cloudflare handle inference; Kokoro and Remotion create the video. Try it: https://wooden-pheasant-677.convex.site/” Required event tags: @convex @OpenAI @firecrawl @agentmail. Tagging a sponsor does not imply its model API is used.

Official event: https://www.convex.dev/hackathons/all-gas. Check the live VibeApps form and deadline before submission. No final entry, social post, or demo video has been submitted by this task.

Official submission deadline checked September 5: September 22, 2026 at 12:00 PM Pacific (September 23 at 00:45 Nepal time). Submit on VibeApps. Registration and participant eligibility remain the owner's responsibility.
