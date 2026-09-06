"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ConvexProvider, ConvexReactClient, useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Clock3, FileText, Layers3, Library, Loader2, PencilLine, Plus, Sparkles, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DURATION_PRESETS, LIMITS, PIPELINE_STAGES } from "@/packages/contracts";
import { PROVIDER_LABELS, type GenerationProvider } from "@/packages/contracts/provider";
import { LessonReview } from "./lesson-review";
import { Showcase } from "./showcase";
import { StyleStudy } from "./style-study";
import { friendlyError, StudioToast } from "./studio-toast";

type Job = FunctionReturnType<typeof api.jobs.list>[number];
type Brief = { topic: string; duration: number; audience: "beginner" | "student"; generationProvider: GenerationProvider; requestId: string };
type ProviderAvailability = Record<GenerationProvider, { enabled: boolean; message: string }>;
type Notification = { id: string; message: string };
const EMPTY_JOBS: Job[] = [];
const GENERATION_PROVIDERS: GenerationProvider[] = ["nim", "openai"];
const SESSION_KEY = "explainer.session.v1";
const SUGGESTIONS = ["Why do leaves change color?", "How does a solar panel work?", "Why does the Moon appear to change shape?"];

function subscribeToLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}
function selectedJobFromLocation() { return new URLSearchParams(window.location.search).get("job"); }
function serverSelectedJob() { return null; }

function sessionToken() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (saved && /^[a-f0-9]{64}$/.test(saved.token) && saved.expiresAt > Date.now()) return saved.token as string;
  } catch { /* An unavailable or older browser record starts a fresh session. */ }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt: Date.now() + LIMITS.sessionLifetimeMs }));
  return token;
}

export function StudioApp() {
  const [client] = useState(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    return url ? new ConvexReactClient(url) : null;
  });
  if (!client) return <Studio jobs={EMPTY_JOBS} ready={false} connectionMessage="Workspace preview · database connection not configured" />;
  return <ConvexProvider client={client}><ConnectedStudio /></ConvexProvider>;
}

function ConnectedStudio() {
  const start = useMutation(api.sessions.start);
  const create = useMutation(api.jobs.create);
  const cancel = useMutation(api.jobs.cancel);
  const createSample = useMutation(api.media.createSample);
  const generate = useMutation(api.generation.generate);
  const checkProvider = useAction(api.generation.checkProvider);
  const availability = useQuery(api.generation.availability);
  const [token, setToken] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState("");
  useEffect(() => {
    let active = true;
    async function connect() {
      try {
        let candidate = sessionToken();
        let result = await start({ token: candidate });
        if (result.expiresAt <= Date.now()) {
          localStorage.removeItem(SESSION_KEY);
          candidate = sessionToken();
          result = await start({ token: candidate });
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify({ token: candidate, expiresAt: result.expiresAt }));
        if (active) setToken(candidate);
      } catch { if (active) setConnectionError("Couldn’t connect. Enable browser storage and check your connection."); }
    }
    void connect();
    return () => { active = false; };
  }, [start]);
  const jobs = useQuery(api.jobs.list, token ? { token } : "skip");
  return <Studio
    gallery={<Showcase />}
    jobs={jobs ?? EMPTY_JOBS} ready={Boolean(token && jobs)}
    connectionMessage={connectionError || (token && jobs ? "Your workspace is connected" : "Connecting your workspace…")}
    save={async (brief) => { if (!token) throw new Error("No session"); return create({ ...brief, token }); }}
    cancel={async (jobId) => { if (!token) throw new Error("No session"); await cancel({ token, jobId }); }}
    sample={async (requestId) => { if (!token) throw new Error("No session"); return createSample({ token, requestId }); }}
    providers={availability?.providers}
    checkProvider={async generationProvider => { if (!token) throw new Error("No session"); await checkProvider({ token, generationProvider }); }}
    generate={async jobId => { if (!token) throw new Error("No session"); await generate({ token, jobId }); }}
    resultPanel={(jobId, onError) => token ? <MediaResult key={jobId} token={token} jobId={jobId} onError={onError} /> : null}
  />;
}

function MediaResult({ token, jobId, onError }: { token: string; jobId: Id<"jobs">; onError: (error: unknown) => void }) {
  const result = useQuery(api.media.result, { token, jobId });
  const details = useQuery(api.generation.details, { token, jobId });
  const retryPlanning = useMutation(api.generation.retryPlanning);
  const checkLessonProvider = useAction(api.generation.checkLessonProvider);
  const [retryError, setRetryError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const sources = details?.sources.length ? <details className="source-list"><summary>Research sources ({details.sources.length})</summary><ul>{details.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul><small>Sources inform the script. Review findings appear below when the draft is rendered.</small></details> : null;
  if (!result?.video) return <>{sources}{details?.canRetry ? <button className="primary-button" disabled={retrying} onClick={async () => { setRetrying(true); setRetryError(""); try { await checkLessonProvider({ token, jobId }); await retryPlanning({ token, jobId }); } catch (error) { setRetryError(friendlyError(error)); onError(error); } finally { setRetrying(false); } }}>{details.sources.length ? "Retry using saved research" : "Retry generation"}</button> : null}{retryError ? <p>{retryError}</p> : null}<LessonReview key={jobId} token={token} jobId={jobId} approved={false} onError={onError} /></>;
  return <div className="media-result">
    {result.generated && !result.approved ? <p className="draft-notice"><strong>Unapproved draft</strong>: For your review. Email delivery is disabled until this version passes.</p> : null}
    <video controls preload="metadata" poster={result.poster || undefined} src={result.video} crossOrigin="anonymous" aria-label="Rendered explainer lesson">
      {result.captions ? <track kind="captions" src={result.captions} srcLang="en" label="English" /> : null}
    </video>
    <p>{result.generated ? "AI-planned lesson" : "Original scripted demo"} · {result.durationSeconds.toFixed(1)} seconds · Kokoro voice</p>
    <div className="artifact-links"><a href={result.video} target="_blank" rel="noreferrer">Open video</a>{result.project ? <a href={result.project} target="_blank" rel="noreferrer">Project, transcript & sources</a> : null}{result.captions ? <a href={result.captions} target="_blank" rel="noreferrer">Captions</a> : null}</div>
    <small>Original diagrams and catalog artwork. <a href="https://openmoji.org/">OpenMoji</a> assets: <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. <a href="/lesson-assets/NOTICE.md">Artwork credits</a>; selected illustrations are recorded in the project download.</small>
    {sources}
    <LessonReview key={jobId} token={token} jobId={jobId} approved={result.approved} onError={onError} />
  </div>;
}

function Studio({ jobs, ready, connectionMessage, save, cancel, sample, resultPanel, generate, gallery, providers, checkProvider }: {
  jobs: Job[]; ready: boolean; connectionMessage: string; providers?: ProviderAvailability;
  checkProvider?: (generationProvider: GenerationProvider) => Promise<void>;
  generate?: (jobId: Id<"jobs">) => Promise<void>;
  save?: (brief: Brief) => Promise<Id<"jobs">>;
  cancel?: (id: Id<"jobs">) => Promise<void>;
  sample?: (requestId: string) => Promise<Id<"jobs">>;
  resultPanel?: (jobId: Id<"jobs">, onError: (error: unknown) => void) => ReactNode;
  gallery?: ReactNode;
}) {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState<number>(75);
  const [audience, setAudience] = useState<"beginner" | "student">("beginner");
  const [generationProvider, setGenerationProvider] = useState<GenerationProvider>("nim");
  const selectedId = useSyncExternalStore(subscribeToLocation, selectedJobFromLocation, serverSelectedJob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notification, setNotification] = useState<Notification | null>(null);
  const [dismissedNotifications, setDismissedNotifications] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingBrief, setPendingBrief] = useState<Brief | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [sampleRequest, setSampleRequest] = useState<string | null>(null);
  const selected = jobs.find((job) => job._id === selectedId);
  const providerReady = providers?.[generationProvider].enabled ?? false;
  const saveBriefOnly = generationProvider === "nim" && Boolean(providers) && !providerReady;
  const selectedProvider = selected?.generationProvider ?? "nim";
  const failedLessonNotification = selected?.status === "failed" ? { id: `${selected._id}:${selected.updatedAt}`, message: selected.stageMessage } : null;
  const visibleNotification = notification && !dismissedNotifications.has(notification.id) ? notification : null;
  const toast = visibleNotification ?? (failedLessonNotification && !dismissedNotifications.has(failedLessonNotification.id) ? failedLessonNotification : null);
  function notify(message: string) { setNotification({ id: crypto.randomUUID(), message }); }
  function reportError(error: unknown) { const message = friendlyError(error); setError(message); notify(message); }
  function chooseProvider(provider: GenerationProvider) {
    setGenerationProvider(provider);
    setError("");
    setNotification(null);
    if (providers && !providers[provider].enabled) notify(providers[provider].message);
  }
  function select(id: string | null) {
    setNotification(null); setError("");
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("job", id); else url.searchParams.delete("job");
    window.history.replaceState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!save || !ready || busy || !providers) return;
    setBusy(true); setError(""); setNotification(null);
    const brief = pendingBrief?.topic === topic && pendingBrief.duration === duration && pendingBrief.audience === audience && pendingBrief.generationProvider === generationProvider
      ? pendingBrief : { topic, duration, audience, generationProvider, requestId: crypto.randomUUID() };
    setPendingBrief(brief);
    try {
      if (!saveBriefOnly) await checkProvider?.(generationProvider);
      const id = await save(brief);
      select(id);
      if (!saveBriefOnly) await generate?.(id);
      setPendingBrief(null);
    }
    catch (err) { reportError(err); }
    finally { setBusy(false); }
  }
  async function generateSelected() {
    if (!selected || !generate || busy) return;
    setBusy(true); setError(""); setNotification(null);
    try { await checkProvider?.(selectedProvider); await generate(selected._id); } catch (err) { reportError(err); }
    finally { setBusy(false); }
  }
  async function cancelSelected() {
    if (!cancel || !selected || busy) return;
    setBusy(true); setError(""); setNotification(null);
    try { await cancel(selected._id); } catch (err) { reportError(err); }
    finally { setBusy(false); }
  }
  async function renderSample() {
    if (!sample || !ready || busy) return;
    setBusy(true); setError(""); setNotification(null);
    const requestId = sampleRequest || crypto.randomUUID();
    setSampleRequest(requestId);
    try { select(await sample(requestId)); setSampleRequest(null); }
    catch (err) { reportError(err); }
    finally { setBusy(false); }
  }
  return (
    <div className="app-shell">
      {toast ? <StudioToast key={toast.id} message={toast.message} onDismiss={() => setDismissedNotifications(current => new Set(current).add(toast.id))} /> : null}
      <aside className="sidebar">
        <Link href="/" className="brand"><span className="brand-mark"><BookOpen size={23} /></span><span>explainer<span className="brand-sub">STUDIO</span></span></Link>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button className="nav-item active" onClick={() => { select(null); document.getElementById("topic")?.focus(); }}><PencilLine size={18} /> Create a lesson <Plus size={15} className="nav-trailing" /></button>
          <a className="nav-item" href="#your-lessons"><Library size={18} /> Your lessons <span className="nav-count">{jobs.length}</span></a>
          <button className="nav-item" onClick={() => setShowInfo((value) => !value)} aria-expanded={showInfo}><CircleHelp size={18} /> How it works</button>
        </nav>
        <div className="sidebar-note"><span className="little-spark">✳</span><h3>Make an idea click.</h3><p>A good explanation starts with a little curiosity.</p><div className="note-line" /></div>
        <div className="sidebar-bottom"><span className="avatar">Y</span><div>Your personal studio<small>Early access · Illustrated lessons</small></div></div>
      </aside>
      <div className="main-column">
        <header className="topbar"><div>Workspace <ChevronRight size={14} /><span>Create a lesson</span></div><span className="release-pill"><span /> Source-backed explainers</span></header>
        <main>
          <div className="intro"><div className="eyebrow"><span /> A LITTLE CURIOSITY GOES A LONG WAY</div><h1>Big ideas.<br /><em>Clearly explained.</em></h1><p>Start with a question. Shape it into a short, illustrated lesson<br className="desktop-break" /> that makes the complicated feel simple.</p></div>
          {showInfo ? <section className="info-banner"><button onClick={() => setShowInfo(false)} aria-label="Close explanation"><X size={17} /></button><strong>From a question to a visual lesson</strong><p>Choose NVIDIA NIM + Cloudflare Workers AI or OpenAI to research your question, plan scenes and review the finished video. Each route uses the same illustrated animation and Kokoro narration. Automated source and frame checks must pass before sharing or email delivery. The scripted demo is also available.</p></section> : null}
          <div className="creation-grid">
            <section className="brief-card" aria-labelledby="brief-heading">
              <div className="section-heading"><span className="step-number">01</span><h2 id="brief-heading">What are we explaining?</h2><PencilLine size={18} /></div>
              <form onSubmit={submit}>
                <label className="sr-only" htmlFor="topic">Your question or topic</label>
                <textarea id="topic" name="topic" value={topic} onChange={(event) => setTopic(event.target.value)} minLength={LIMITS.topicMin} maxLength={LIMITS.topicMax} required placeholder={"Why do leaves change color?\nHow does a solar panel work?\nWhat’s something you’ve always wondered?"} />
                <div className="field-meta"><span>One question. A whole new understanding.</span><span>{topic.length}/{LIMITS.topicMax}</span></div>
                <div className="suggestion-label">NEED A LITTLE INSPIRATION?</div>
                <div className="suggestions">{SUGGESTIONS.slice(0, 2).map((suggestion) => <button type="button" key={suggestion} onClick={() => { setTopic(suggestion); document.getElementById("topic")?.focus(); }}><Sparkles size={12} />{suggestion}</button>)}</div>
                <div className="form-divider" />
                <div className="settings-row"><fieldset><legend><Clock3 size={14} /> Lesson length</legend><div className="segments">{DURATION_PRESETS.map((value) => <button key={value} type="button" aria-pressed={duration === value} className={duration === value ? "selected" : ""} onClick={() => setDuration(value)}>{value}s</button>)}</div></fieldset><div className="audience-field"><label htmlFor="audience"><BookOpen size={14} /> Explain it for</label><select id="audience" value={audience} onChange={(event) => setAudience(event.target.value as "beginner" | "student")}><option value="beginner">A curious beginner</option><option value="student">A school student</option></select></div></div>
                <fieldset className="provider-field" disabled={busy} aria-describedby="provider-note"><legend><Sparkles size={14} /> Generate with</legend><div className="provider-options">{GENERATION_PROVIDERS.map(provider => <label key={provider} className={`provider-option ${generationProvider === provider ? "selected" : ""}`}><input type="radio" name="generationProvider" value={provider} checked={generationProvider === provider} onChange={() => chooseProvider(provider)} /><span><strong>{PROVIDER_LABELS[provider]}</strong><small>{providers ? providers[provider].enabled ? "Available" : "Setup needed" : "Checking availability…"}</small></span>{generationProvider === provider ? <Check size={15} aria-hidden="true" /> : null}</label>)}</div><p id="provider-note">{providers ? providers[generationProvider].enabled ? "Your selected provider plans and reviews this lesson. Narration and animation are the same for both routes." : providers[generationProvider].message : "Connect your workspace to check which generation routes are available."}</p></fieldset>
                <button className="primary-button" type="submit" disabled={!ready || busy || !providers}>{busy ? <Loader2 size={17} className="spin" /> : <Plus size={17} />} {busy ? "Preparing your lesson…" : saveBriefOnly ? "Save lesson brief" : "Generate lesson"} <ArrowRight size={17} /></button>
                <p className="foundation-note">{saveBriefOnly ? "Topic generation is awaiting service setup. Save your brief or try the animation demo." : "Research, narration and animation take a few minutes. Lesson length is a target."}</p>
                <div className={`connection-line ${ready ? "connected" : ""}`} role="status"><span />{connectionMessage}</div>
              </form>
            </section>
            <section className="preview-column" aria-label="Lesson preview">
              <div className="preview-heading"><span><Layers3 size={15} /> A glimpse of the style</span><span>16:9 · Whiteboard</span></div>
              <StyleStudy />
              <div className="preview-note"><span className="small-check"><Check size={13} /></span><p>Illustrations that explain. A voice that guides.<br /><strong>Room for the idea to breathe.</strong></p></div>
              <div className="style-disclaimer">Original layout sketch · not a generated video</div>
              <div className="sample-card"><strong>See the animation come to life</strong><p>Render a fresh copy of our scripted plant-energy demo with a real voice and three animated scenes.</p><button className="primary-button" type="button" disabled={!ready || busy} onClick={renderSample}><Layers3 size={17} /> Render demo lesson <ArrowRight size={17} /></button><small>This uses a fixed demo script. Your own topic uses the separate generation pipeline.</small></div>
            </section>
          </div>
          {error ? <p className="error-banner">{error}</p> : null}
          {selected ? <section className="selected-brief" aria-live="polite"><div className="selected-top"><span className="eyebrow">YOUR LESSON BRIEF</span><span className={`status-badge ${selected.status}`}>{selected.status === "queued" ? "Brief saved" : selected.status}</span></div><h2>{selected.topic}</h2><p className="lesson-provider">{selected.isSample ? "Scripted demo" : `Generation route: ${PROVIDER_LABELS[selectedProvider]}`}</p><p>{selected.stageMessage}</p>{resultPanel?.(selected._id, reportError)}{selected.status === "queued" && !selected.isSample ? <><button className="primary-button" disabled={busy || !providers} onClick={generateSelected}>Generate this lesson <ArrowRight size={17} /></button>{providers && !providers[selectedProvider].enabled ? <p className="foundation-note">{providers[selectedProvider].message}</p> : null}</> : null}{["researching", "planning", "rendering", "reviewing"].includes(selected.status) ? <div className="pipeline">{PIPELINE_STAGES.map((stage, index) => <div key={stage.id}><span>{index + 1}</span><strong>{stage.label}</strong><small>{stage.description}</small></div>)}</div> : null}{selected.status !== "cancelled" && selected.status !== "completed" && selected.status !== "failed" ? <button className="text-button" disabled={busy} onClick={cancelSelected}><X size={14} /> Cancel this lesson</button> : null}</section> : null}
          {gallery}
          <section id="your-lessons" className="library-section"><div className="library-heading"><div><span className="eyebrow">YOUR NEXT EXPLANATION STARTS HERE</span><h2>Your lessons <span>{jobs.length.toString().padStart(2, "0")}</span></h2></div><span className="private-note">Saved to this browser’s workspace</span></div>
            {jobs.length ? <div className="lesson-list">{jobs.map((job) => <button key={job._id} className={`lesson-row ${selectedId === job._id ? "current" : ""}`} onClick={() => select(job._id)}><span className="lesson-icon"><FileText size={20} /></span><span className="lesson-copy"><strong>{job.topic}</strong><small>{job.duration}s · {job.audience === "student" ? "School student" : "Curious beginner"} · {job.isSample ? "Scripted demo" : PROVIDER_LABELS[job.generationProvider ?? "nim"]}</small></span><span className={`status-badge ${job.status}`}>{job.status === "queued" ? "Brief saved" : job.status}</span><ArrowRight size={17} /></button>)}</div> : <div className="empty-library"><div><FileText size={23} /></div><h3>A blank page is a good beginning.</h3><p>Your saved lesson briefs will appear here.<br />Start with one question above.</p></div>}
          </section>
          <footer><span>Made for the moments when something finally clicks.</span><span>Explainer Studio · 2026</span></footer>
        </main>
      </div>
    </div>
  );
}
