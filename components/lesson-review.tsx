"use client";
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ExternalLink, Link2, Mail, PencilLine, RotateCcw, ShieldCheck } from "lucide-react";
import { friendlyError } from "./studio-toast";

const buttonStyle = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";
const fieldStyle = "min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";
const labelStyle = "flex min-w-0 flex-col gap-2 text-sm font-medium text-foreground";
const consentStyle = "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/35 p-3 text-sm leading-6 text-muted-foreground";
const checkboxStyle = "mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function LessonReview({ token, jobId, approved, onError }: { token: string; jobId: Id<"jobs">; approved: boolean; onError?: (error: unknown) => void }) {
  const review = useQuery(api.reviews.details, { token, jobId });
  const delivery = useQuery(api.delivery.status, { token, jobId });
  const createShare = useMutation(api.delivery.createShare);
  const revokeShares = useMutation(api.delivery.revokeShares);
  const [share, setShare] = useState<{ token: string; url: string; revision: number } | null>(null);
  const revise = useMutation(api.reviews.revise);
  const retryReview = useMutation(api.reviews.retryReview);
  const checkLessonProvider = useAction(api.generation.checkLessonProvider);
  const verify = useMutation(api.delivery.verify);
  const requestEmail = useAction(api.mailActions.requestVerification);
  const sendLesson = useAction(api.mailActions.sendLesson);
  const [scene, setScene] = useState("");
  const [instruction, setInstruction] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [sendConsent, setSendConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editRequest, setEditRequest] = useState<{ key: string; id: string } | null>(null);
  async function perform(work: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage("");
    try { await work(); setMessage(success); }
    catch (error) { setMessage(friendlyError(error)); onError?.(error); }
    finally { setBusy(false); }
  }
  if (!review) return null;
  return <section className="review-panel min-w-0 space-y-4 text-foreground" aria-label="Lesson review and delivery" aria-busy={busy}>
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17} className="text-muted-foreground" aria-hidden="true" />Review · revision {review.revision}</h3>
      {review.canRetryReview ? <button className={`${buttonStyle} mt-4`} disabled={busy} onClick={() => void perform(async () => { await checkLessonProvider({ token, jobId }); await retryReview({ token, jobId, revision: review.revision }); }, "Review queued using the saved video.")}><RotateCcw size={15} aria-hidden="true" />Retry unavailable review</button> : null}
      {!review.reviews.length ? <p className="mt-3 text-sm leading-6 text-muted-foreground">This draft has not had a factual and visual review.</p> : <div className="mt-3 space-y-2">{review.reviews.map(r => <details key={r.revision} open={r.revision === review.revision} className="rounded-xl border border-border bg-background px-3 sm:px-4">
        <summary className="min-h-11 cursor-pointer rounded-lg py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Revision {r.revision}: {r.status}</summary>
        <div className="space-y-3 border-t border-border py-3 text-sm leading-6 text-muted-foreground">
          {r.model ? <small className="block break-words text-xs">{r.provider === "cloudflare" ? "Cloudflare Workers AI" : r.provider === "nvidia" ? "NVIDIA NIM" : r.provider === "openai" ? "OpenAI" : "Provider not recorded"} / {r.model}</small> : null}
          {r.report ? <><p className="break-words">{r.report.summary}</p><ul className="divide-y divide-border">{r.report.scenes.map(s => <li key={s.sceneId} className="space-y-2 py-3 first:pt-0 last:pb-0">
            <p className="break-words"><strong className="font-medium text-foreground">{review.scenes.find(scene => scene.id === s.sceneId)?.title || s.sceneId}</strong>: <span className={s.factualPass && s.visualPass ? "text-emerald-700" : "text-amber-800"}>{s.factualPass && s.visualPass ? "Passed source and frame checks" : "Needs revision"}</span></p>
            {s.issues.map((i, index) => <p key={index} className="break-words rounded-lg border border-border bg-card px-3 py-2">{i.detail} {i.repair}</p>)}
          </li>)}</ul></> : <p>{r.status === "pending" ? "Checking source support and sampled frames from the video." : "The critic could not finish. This draft is not approved."}</p>}
        </div>
      </details>)}</div>}
    </div>
    {review.canRevise ? <form className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" onSubmit={event => { event.preventDefault(); const sceneId = scene || review.scenes[0]?.id; if (!sceneId) return; const key = JSON.stringify([review.revision, sceneId, instruction]); const requestId = editRequest?.key === key ? editRequest.id : crypto.randomUUID(); setEditRequest({ key, id: requestId }); void perform(async () => { await checkLessonProvider({ token, jobId }); await revise({ token, jobId, revision: review.revision, requestId, sceneId, instruction }); }, "Scene edit queued."); }}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><PencilLine size={17} className="text-muted-foreground" aria-hidden="true" />Edit one scene</h3>
      <label className={labelStyle}>Scene<select className={fieldStyle} value={scene || review.scenes[0]?.id || ""} onChange={e => setScene(e.target.value)}>{review.scenes.map(s => <option value={s.id} key={s.id}>{s.title}</option>)}</select></label>
      <label className={labelStyle}>What should change?<textarea className={`${fieldStyle} min-h-28 resize-y leading-6`} value={instruction} onChange={e => setInstruction(e.target.value)} minLength={5} maxLength={500} required placeholder="Explain this part more simply, using the bee and flower." /></label>
      <small className="block text-xs leading-5 text-muted-foreground">Up to two requested edits per lesson. Each new version must pass review.</small><button className={buttonStyle} disabled={busy}>Revise scene</button>
    </form> : null}
    {approved ? <div className="share-panel space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 size={17} className="text-muted-foreground" aria-hidden="true" />Share this lesson</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Anyone with the link can watch this approved version for seven days.</p></div>
      <button className={buttonStyle} disabled={busy} onClick={() => void perform(async () => { const shareToken = (share?.revision === review.revision ? share.token : null) || Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,"0")).join(""); const url = await createShare({ token, jobId, revision: review.revision, shareToken }); setShare({ token: shareToken, url, revision: review.revision }); }, "Share link ready.")}>Create share link</button>
      {share ? <label className={labelStyle}>Lesson link<input className={fieldStyle} value={share.url} readOnly onFocus={e => e.target.select()} /><a href={share.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Open shared lesson<ExternalLink size={14} aria-hidden="true" /></a></label> : null}
      <button className="block min-h-11 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50" disabled={busy} onClick={() => void perform(async () => { await revokeShares({ token, jobId }); setShare(null); }, "All share links for this lesson revoked.")}>Revoke all share links</button>
    </div> : null}
    {approved ? <div className="delivery-panel space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Mail size={17} className="text-muted-foreground" aria-hidden="true" />Email this lesson</h3>
      {!delivery?.enabled ? <p className="text-sm leading-6 text-muted-foreground">Email delivery is awaiting service setup. Your video is available above.</p> : !delivery.verified ? <>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void perform(() => requestEmail({ token, jobId, email, consent }), "Verification requested. Check your inbox, then paste the code below."); }}>
          <label className={labelStyle}>Your email<input className={fieldStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label className={consentStyle}><input className={checkboxStyle} type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Send a verification email to this address.</span></label>
          <button className={buttonStyle} disabled={busy || !consent}>Send verification</button>
        </form>
        {delivery.email ? <form className="space-y-4 border-t border-border pt-4" onSubmit={event => { event.preventDefault(); void perform(async () => { if (!await verify({ token, jobId, code: code.trim() })) throw new ConvexError("Code expired or incorrect. Five attempts are allowed."); }, "Email verified. You can now send this lesson."); }}>
          <label className={labelStyle}>Code from the email<input className={fieldStyle} value={code} onChange={e => setCode(e.target.value)} maxLength={64} required autoComplete="one-time-code" /></label><button className={buttonStyle} disabled={busy}>Verify address</button>
        </form> : null}
      </> : <>
        <p className="break-words text-sm leading-6 text-muted-foreground">Verified address: {delivery.email}</p>
        <label className={consentStyle}><input className={checkboxStyle} type="checkbox" checked={sendConsent} onChange={e => setSendConsent(e.target.checked)} /><span>Send this lesson with a link that anyone holding it can open for seven days.</span></label>
        <button className={buttonStyle} disabled={busy || !sendConsent || delivery.messages.some(m => m.kind === "lesson" && m.revision === review.revision)} onClick={() => void perform(() => sendLesson({ token, jobId, revision: review.revision, consent: sendConsent }), "Lesson email queued.")}>Email approved lesson</button>
      </>}
      {delivery?.messages.map((m, i) => <p key={i} className="rounded-lg border border-border bg-secondary/35 px-3 py-2 text-xs leading-5 text-muted-foreground"><small className="text-xs">{m.kind === "lesson" ? `Lesson revision ${m.revision}` : "Verification email"}: {m.state}</small></p>)}
    </div> : null}
    {message ? <p role="status" className="break-words rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm leading-6">{message}</p> : null}
  </section>;
}
