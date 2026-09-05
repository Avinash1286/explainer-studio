"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Clock3, FileText, Layers3, Library, Loader2, PencilLine, Plus, Sparkles, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DURATION_PRESETS, LIMITS, PIPELINE_STAGES } from "@/packages/contracts";
import { StyleStudy } from "./style-study";

type Job = FunctionReturnType<typeof api.jobs.list>[number];
type Brief = { topic: string; duration: number; audience: "beginner" | "student"; requestId: string };
const EMPTY_JOBS: Job[] = [];
const SESSION_KEY = "explainer.session.v1";
const SUGGESTIONS = ["Why do leaves change color?", "How does a solar panel work?", "Why do recessive traits skip a generation?"];

function subscribeToLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}
function selectedJobFromLocation() { return new URLSearchParams(window.location.search).get("job"); }
function serverSelectedJob() { return null; }

function friendlyError(error: unknown) {
  if (error instanceof ConvexError) return String(error.data);
  return "We couldn’t save that change. Check your connection and try again.";
}

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
    jobs={jobs ?? EMPTY_JOBS} ready={Boolean(token && jobs)}
    connectionMessage={connectionError || (token && jobs ? "Your workspace is connected" : "Connecting your workspace…")}
    save={async (brief) => { if (!token) throw new Error("No session"); return create({ ...brief, token }); }}
    cancel={async (jobId) => { if (!token) throw new Error("No session"); await cancel({ token, jobId }); }}
    sample={async (requestId) => { if (!token) throw new Error("No session"); return createSample({ token, requestId }); }}
    generationEnabled={availability?.enabled ?? false}
    generate={async jobId => { if (!token) throw new Error("No session"); await generate({ token, jobId }); }}
    resultPanel={(jobId) => token ? <MediaResult token={token} jobId={jobId} /> : null}
  />;
}

function MediaResult({ token, jobId }: { token: string; jobId: Id<"jobs"> }) {
  const result = useQuery(api.media.result, { token, jobId });
  const details = useQuery(api.generation.details, { token, jobId });
  const sources = details?.sources.length ? <details className="source-list"><summary>Research sources ({details.sources.length})</summary><ul>{details.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul><small>Sources inform the script. Automated factual and frame review comes in the next phase.</small></details> : null;
  if (!result?.video) return sources;
  return <div className="media-result">
    <video controls preload="metadata" poster={result.poster || undefined} src={result.video} crossOrigin="anonymous" aria-label="Rendered explainer lesson">
      {result.captions ? <track kind="captions" src={result.captions} srcLang="en" label="English" /> : null}
    </video>
    <p>{result.generated ? "AI-planned lesson" : "Original scripted demo"} · {result.durationSeconds.toFixed(1)} seconds · Kokoro voice</p>
    <div className="artifact-links"><a href={result.video} target="_blank" rel="noreferrer">Open video</a>{result.project ? <a href={result.project} target="_blank" rel="noreferrer">Project, transcript & sources</a> : null}{result.captions ? <a href={result.captions} target="_blank" rel="noreferrer">Captions</a> : null}</div>
    <small>Illustrations by <a href="https://openmoji.org/">OpenMoji</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Stroke and fill animation adaptations.</small>
    {sources}
  </div>;
}

function Studio({ jobs, ready, connectionMessage, save, cancel, sample, resultPanel, generate, generationEnabled = false }: {
  jobs: Job[]; ready: boolean; connectionMessage: string; generationEnabled?: boolean;
  generate?: (jobId: Id<"jobs">) => Promise<void>;
  save?: (brief: Brief) => Promise<Id<"jobs">>;
  cancel?: (id: Id<"jobs">) => Promise<void>;
  sample?: (requestId: string) => Promise<Id<"jobs">>;
  resultPanel?: (jobId: Id<"jobs">) => ReactNode;
}) {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState<number>(75);
  const [audience, setAudience] = useState<"beginner" | "student">("beginner");
  const selectedId = useSyncExternalStore(subscribeToLocation, selectedJobFromLocation, serverSelectedJob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingBrief, setPendingBrief] = useState<Brief | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [sampleRequest, setSampleRequest] = useState<string | null>(null);
  const selected = jobs.find((job) => job._id === selectedId);
  function select(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("job", id); else url.searchParams.delete("job");
    window.history.replaceState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!save || !ready || busy) return;
    setBusy(true); setError("");
    const brief = pendingBrief?.topic === topic && pendingBrief.duration === duration && pendingBrief.audience === audience
      ? pendingBrief : { topic, duration, audience, requestId: crypto.randomUUID() };
    setPendingBrief(brief);
    try { const id = await save(brief); select(id); setPendingBrief(null); if (generationEnabled) await generate?.(id); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  }
  async function generateSelected() {
    if (!selected || !generate || busy) return;
    setBusy(true); setError("");
    try { await generate(selected._id); } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  }
  async function cancelSelected() {
    if (!cancel || !selected || busy) return;
    setBusy(true); setError("");
    try { await cancel(selected._id); } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  }
  async function renderSample() {
    if (!sample || !ready || busy) return;
    setBusy(true); setError("");
    const requestId = sampleRequest || crypto.randomUUID();
    setSampleRequest(requestId);
    try { select(await sample(requestId)); setSampleRequest(null); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand"><span className="brand-mark"><BookOpen size={23} /></span><span>explainer<span className="brand-sub">STUDIO</span></span></Link>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button className="nav-item active" onClick={() => { select(null); document.getElementById("topic")?.focus(); }}><PencilLine size={18} /> Create a lesson <Plus size={15} className="nav-trailing" /></button>
          <a className="nav-item" href="#your-lessons"><Library size={18} /> Your lessons <span className="nav-count">{jobs.length}</span></a>
          <button className="nav-item" onClick={() => setShowInfo((value) => !value)} aria-expanded={showInfo}><CircleHelp size={18} /> How it works</button>
        </nav>
        <div className="sidebar-note"><span className="little-spark">✳</span><h3>Make an idea click.</h3><p>A good explanation starts with a little curiosity.</p><div className="note-line" /></div>
        <div className="sidebar-bottom"><span className="avatar">Y</span><div>Your personal studio<small>Early access · Media demo</small></div></div>
      </aside>
      <div className="main-column">
        <header className="topbar"><div>Workspace <ChevronRight size={14} /><span>Create a lesson</span></div><span className="release-pill"><span /> In the making</span></header>
        <main>
          <div className="intro"><div className="eyebrow"><span /> A LITTLE CURIOSITY GOES A LONG WAY</div><h1>Big ideas.<br /><em>Clearly explained.</em></h1><p>Start with a question. Shape it into a short, illustrated lesson<br className="desktop-break" /> that makes the complicated feel simple.</p></div>
          {showInfo ? <section className="info-banner"><button onClick={() => setShowInfo(false)} aria-label="Close explanation"><X size={17} /></button><strong>From a question to a visual lesson</strong><p>Topic generation researches your question, plans supported scenes, selects illustrations and renders a narrated lesson. It becomes available after service setup is verified. You can save a brief and render the scripted demo now. Automated frame review comes next.</p></section> : null}
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
                <button className="primary-button" type="submit" disabled={!ready || busy}>{busy ? <Loader2 size={17} className="spin" /> : <Plus size={17} />} {generationEnabled ? "Generate lesson" : "Save lesson brief"} <ArrowRight size={17} /></button>
                <p className="foundation-note">{generationEnabled ? "Research, narration and animation take a few minutes. Lesson length is a target." : "Topic generation is awaiting service setup. Save your brief or try the animation demo."}</p>
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
          {error ? <p className="error-banner" role="alert">{error}</p> : null}
          {selected ? <section className="selected-brief" aria-live="polite"><div className="selected-top"><span className="eyebrow">YOUR LESSON BRIEF</span><span className={`status-badge ${selected.status}`}>{selected.status === "queued" ? "Brief saved" : selected.status}</span></div><h2>{selected.topic}</h2><p>{selected.stageMessage}</p>{resultPanel?.(selected._id)}{selected.status === "queued" && generationEnabled ? <button className="primary-button" disabled={busy} onClick={generateSelected}>Generate this lesson <ArrowRight size={17} /></button> : null}{["researching", "planning", "rendering"].includes(selected.status) ? <div className="pipeline">{PIPELINE_STAGES.filter(stage => stage.id !== "reviewing").map((stage, index) => <div key={stage.id}><span>{index + 1}</span><strong>{stage.label}</strong><small>{stage.description}</small></div>)}</div> : null}{selected.status !== "cancelled" && selected.status !== "completed" && selected.status !== "failed" ? <button className="text-button" disabled={busy} onClick={cancelSelected}><X size={14} /> Cancel this lesson</button> : null}</section> : null}
          <section id="your-lessons" className="library-section"><div className="library-heading"><div><span className="eyebrow">YOUR NEXT EXPLANATION STARTS HERE</span><h2>Your lessons <span>{jobs.length.toString().padStart(2, "0")}</span></h2></div><span className="private-note">Saved to this browser’s workspace</span></div>
            {jobs.length ? <div className="lesson-list">{jobs.map((job) => <button key={job._id} className={`lesson-row ${selectedId === job._id ? "current" : ""}`} onClick={() => select(job._id)}><span className="lesson-icon"><FileText size={20} /></span><span className="lesson-copy"><strong>{job.topic}</strong><small>{job.duration}s · {job.audience === "student" ? "School student" : "Curious beginner"}</small></span><span className={`status-badge ${job.status}`}>{job.status === "queued" ? "Brief saved" : job.status}</span><ArrowRight size={17} /></button>)}</div> : <div className="empty-library"><div><FileText size={23} /></div><h3>A blank page is a good beginning.</h3><p>Your saved lesson briefs will appear here.<br />Start with one question above.</p></div>}
          </section>
          <footer><span>Made for the moments when something finally clicks.</span><span>Explainer Studio · 2026</span></footer>
        </main>
      </div>
    </div>
  );
}
