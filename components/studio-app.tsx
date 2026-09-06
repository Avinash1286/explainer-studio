"use client";

import { useEffect, useState } from "react";
import { ConvexProvider, ConvexReactClient, useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Download, FileJson, Captions } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LIMITS } from "@/packages/contracts";
import { LessonReview } from "./lesson-review";
import { friendlyError } from "./studio-toast";
import { Studio } from "./whiteboard/studio-shell";

type Job = FunctionReturnType<typeof api.jobs.list>[number];
const EMPTY_JOBS: Job[] = [];
const SESSION_KEY = "explainer.session.v1";

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
    token={token}
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
  const sources = details?.sources.length ? <details className="rounded-xl border border-border bg-card px-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Research sources ({details.sources.length})</summary><ul className="space-y-2 border-t border-border py-3 text-sm text-muted-foreground">{details.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">{source.title}</a></li>)}</ul><p className="pb-3 text-xs text-muted-foreground">Sources inform the script. Review findings appear below when the draft is rendered.</p></details> : null;
  if (!result?.video) return <>{sources}{details?.canRetry ? <button className="primary-button" disabled={retrying} onClick={async () => { setRetrying(true); setRetryError(""); try { await checkLessonProvider({ token, jobId }); await retryPlanning({ token, jobId }); } catch (error) { setRetryError(friendlyError(error)); onError(error); } finally { setRetrying(false); } }}>{details.sources.length ? "Retry using saved research" : "Retry generation"}</button> : null}{retryError ? <p>{retryError}</p> : null}<LessonReview key={jobId} token={token} jobId={jobId} approved={false} onError={onError} /></>;
  return <div className="space-y-4">
    {result.generated && !result.approved ? <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm leading-6 text-amber-800"><strong>Unapproved draft</strong>: For your review. Email delivery is disabled until this version passes.</p> : null}
    <video className="aspect-video w-full rounded-2xl border border-border bg-black" controls playsInline preload="metadata" poster={result.poster || undefined} src={result.video} crossOrigin="anonymous" aria-label="Rendered explainer lesson">
      {result.captions ? <track kind="captions" src={result.captions} srcLang="en" label="English" /> : null}
    </video>
    <p className="text-xs text-muted-foreground">{result.generated ? "AI-planned lesson" : "Original scripted demo"} · {result.durationSeconds.toFixed(1)} seconds · Kokoro voice</p>
    <div className="flex flex-wrap gap-2"><a className="artifact-link" href={result.video} target="_blank" rel="noreferrer"><Download className="size-4" />Open MP4</a>{result.project ? <a className="artifact-link" href={result.project} target="_blank" rel="noreferrer"><FileJson className="size-4" />Project & transcript</a> : null}{result.captions ? <a className="artifact-link" href={result.captions} target="_blank" rel="noreferrer"><Captions className="size-4" />Captions</a> : null}</div>
    <p className="text-xs leading-5 text-muted-foreground">Original diagrams and catalog artwork. <a className="underline underline-offset-2" href="https://openmoji.org/">OpenMoji</a> assets: <a className="underline underline-offset-2" href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. <a className="underline underline-offset-2" href="/lesson-assets/NOTICE.md">Artwork credits</a>; selected illustrations are recorded in the project download.</p>
    {sources}
    <LessonReview key={jobId} token={token} jobId={jobId} approved={result.approved} onError={onError} />
  </div>;
}
