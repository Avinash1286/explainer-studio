"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Check, Clock3, Loader2, RotateCcw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { friendlyError } from "./studio-toast";

function useRetryClock(deadline: number | null) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (deadline === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current < deadline) timer = setTimeout(tick, Math.min(1000, deadline - current));
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [deadline]);
  return now;
}

function remainingTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function RecoveryPanel({ token, jobId, onError }: { token: string; jobId: Id<"jobs">; onError?: (error: unknown) => void }) {
  const recovery = useQuery(api.recovery.details, { token, jobId });
  const resume = useMutation(api.recovery.resume);
  const headingId = useId(), explanationId = useId();
  const request = useRef<{ identity: string; requestId: string } | null>(null);
  const inFlight = useRef(false), mounted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ identity: string; message: string } | null>(null);
  const retryAt = recovery?.state === "waiting" ? recovery.nextRetryAt : null;
  const resumeAt = recovery?.resumeAvailableAt ?? null;
  const now = useRetryClock(retryAt ?? resumeAt);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  if (!recovery || (recovery.state === "running" && recovery.attempt <= 1 && !busy)) return null;
  const waiting = recovery.state === "waiting", running = recovery.state === "running";
  const coolingDown = resumeAt !== null && (!now || now < resumeAt);
  const blocked = Boolean(recovery.blockedReason);
  const title = waiting ? "Automatic retry scheduled" : running ? "Retry in progress" : "Lesson paused";
  const message = notice?.identity === recovery.identity ? notice.message : null;
  const retryDate = retryAt === null ? null : new Date(retryAt);

  async function resumeLesson() {
    if (!recovery || !recovery.canResume || recovery.blockedReason || inFlight.current || (recovery.resumeAvailableAt !== null && Date.now() < recovery.resumeAvailableAt)) return;
    if (request.current?.identity !== recovery.identity) request.current = { identity: recovery.identity, requestId: crypto.randomUUID() };
    const requestId = request.current.requestId;
    inFlight.current = true;
    setBusy(true); setNotice(null);
    try {
      await resume({ token, jobId, requestId });
      if (mounted.current) setNotice({ identity: recovery.identity, message: "Resuming from saved progress." });
    } catch (error) {
      if (mounted.current) { setNotice({ identity: recovery.identity, message: friendlyError(error) }); onError?.(error); }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <section aria-labelledby={headingId} aria-busy={busy} className="space-y-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-5">
    <div className="flex items-start gap-2.5">
      {waiting ? <Clock3 className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" /> : running ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-amber-700 motion-reduce:animate-none" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />}
      <div className="min-w-0 space-y-1"><h3 id={headingId} className="text-sm font-semibold">{title}</h3>{recovery.reason ? <p className="break-words text-sm leading-6 text-muted-foreground">{recovery.reason}</p> : null}</div>
    </div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="min-w-0"><dt className="text-xs text-muted-foreground">Stage</dt><dd className="mt-1 break-words font-medium">{recovery.stage}</dd></div>
      {recovery.resumeFrom ? <div className="min-w-0"><dt className="text-xs text-muted-foreground">Resume from</dt><dd className="mt-1 break-words font-medium">{recovery.resumeFrom}</dd></div> : null}
    </dl>
    {recovery.maxAttempts > 0 || retryAt !== null ? <div className="space-y-1 text-xs leading-5 text-muted-foreground">
      {recovery.maxAttempts > 0 ? <p>{waiting ? `Next attempt ${recovery.attempt + 1}` : `Attempt ${recovery.attempt}`} of {recovery.maxAttempts}</p> : null}
      {retryAt !== null ? <p aria-live="off">{!now ? "Checking retry time…" : now < retryAt ? <>Next automatic retry in {remainingTime(retryAt - now)}{retryDate && Number.isFinite(retryDate.getTime()) ? <> · <time dateTime={retryDate.toISOString()}>{retryDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</time></> : null}</> : "Retry is due. Waiting for the service to continue."}</p> : null}
    </div> : null}
    {recovery.savedCheckpoints.length ? <details className="rounded-xl border border-border bg-card px-3">
      <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">Saved progress ({recovery.savedCheckpoints.length})</summary>
      <ul className="space-y-2 border-t border-border py-3 text-xs leading-5 text-muted-foreground">{recovery.savedCheckpoints.map((checkpoint, index) => <li key={`${index}:${checkpoint}`} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-700" aria-hidden="true" /><span className="break-words">{checkpoint}</span></li>)}</ul>
    </details> : null}
    <div id={explanationId} className="space-y-1 text-xs leading-5 text-muted-foreground">
      {recovery.blockedReason ? <p className="break-words">{recovery.blockedReason}</p> : null}
      {waiting ? <p>The retry runs automatically. You can leave this page.</p> : null}
      {recovery.canResume && coolingDown ? <p aria-live="off">{now ? `Resume available in ${remainingTime(resumeAt! - now)}.` : "Checking when resume is available…"}</p> : null}
    </div>
    {recovery.canResume ? <Button type="button" className="min-h-11 max-w-full whitespace-normal rounded-xl" disabled={busy || coolingDown || blocked || waiting || running} aria-describedby={explanationId} onClick={() => void resumeLesson()}>{busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}{busy ? "Resuming…" : "Resume from saved progress"}</Button> : null}
    {message ? <p role="status" className="break-words text-sm leading-6">{message}</p> : null}
  </section>;
}
