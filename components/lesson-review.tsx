"use client";
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function LessonReview({ token, jobId, approved }: { token: string; jobId: Id<"jobs">; approved: boolean }) {
  const review = useQuery(api.reviews.details, { token, jobId });
  const delivery = useQuery(api.delivery.status, { token, jobId });
  const revise = useMutation(api.reviews.revise);
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
    catch (error) { setMessage(error instanceof ConvexError ? String(error.data) : "Could not finish. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  if (!review) return null;
  return <section className="review-panel" aria-label="Lesson review and delivery">
    <h3>Review · revision {review.revision}</h3>
    {!review.reviews.length ? <p>This draft has not had a factual and visual review.</p> : review.reviews.map(r => <details key={r.revision} open={r.revision === review.revision}><summary>Revision {r.revision}: {r.status}</summary>{r.model ? <small>{r.provider === "cloudflare" ? "Cloudflare Workers AI" : "Provider not recorded"} / {r.model}</small> : null}{r.report ? <><p>{r.report.summary}</p><ul>{r.report.scenes.map(s => <li key={s.sceneId}><strong>{review.scenes.find(scene => scene.id === s.sceneId)?.title || s.sceneId}</strong>: {s.factualPass && s.visualPass ? "Passed source and frame checks" : "Needs revision"}{s.issues.map((i, index) => <p key={index}>{i.detail} {i.repair}</p>)}</li>)}</ul></> : <p>{r.status === "pending" ? "Checking source support and sampled frames from the video." : "The critic could not finish. This draft is not approved."}</p>}</details>)}
    {review.canRevise ? <form onSubmit={event => { event.preventDefault(); const sceneId = scene || review.scenes[0]?.id; if (!sceneId) return; const key = JSON.stringify([review.revision, sceneId, instruction]); const requestId = editRequest?.key === key ? editRequest.id : crypto.randomUUID(); setEditRequest({ key, id: requestId }); void perform(() => revise({ token, jobId, revision: review.revision, requestId, sceneId, instruction }), "Scene edit queued."); }}>
      <h3>Edit one scene</h3><label>Scene<select value={scene || review.scenes[0]?.id || ""} onChange={e => setScene(e.target.value)}>{review.scenes.map(s => <option value={s.id} key={s.id}>{s.title}</option>)}</select></label>
      <label>What should change?<textarea value={instruction} onChange={e => setInstruction(e.target.value)} minLength={5} maxLength={500} required placeholder="Explain this part more simply, using the bee and flower." /></label>
      <small>Up to two requested edits per lesson. Each new version must pass review.</small><button className="primary-button" disabled={busy}>Revise scene</button>
    </form> : null}
    {approved ? <div className="delivery-panel"><h3>Email this lesson</h3>{!delivery?.enabled ? <p>Email delivery is awaiting service setup. Your video is available above.</p> : !delivery.verified ? <>
      <form onSubmit={event => { event.preventDefault(); void perform(() => requestEmail({ token, jobId, email, consent }), "Verification requested. Check your inbox, then paste the code below."); }}><label>Your email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Send a verification email to this address.</label><button className="primary-button" disabled={busy || !consent}>Send verification</button></form>
      {delivery.email ? <form onSubmit={event => { event.preventDefault(); void perform(async () => { if (!await verify({ token, jobId, code: code.trim() })) throw new ConvexError("Code expired or incorrect. Five attempts are allowed."); }, "Email verified. You can now send this lesson."); }}><label>Code from the email<input value={code} onChange={e => setCode(e.target.value)} maxLength={64} required autoComplete="one-time-code" /></label><button className="primary-button" disabled={busy}>Verify address</button></form> : null}
    </> : <><p>Verified address: {delivery.email}</p><label className="consent"><input type="checkbox" checked={sendConsent} onChange={e => setSendConsent(e.target.checked)} />Send this lesson with a link that anyone holding it can open for seven days.</label><button className="primary-button" disabled={busy || !sendConsent || delivery.messages.some(m => m.kind === "lesson" && m.revision === review.revision)} onClick={() => void perform(() => sendLesson({ token, jobId, revision: review.revision, consent: sendConsent }), "Lesson email queued.")}>Email approved lesson</button></>}{delivery?.messages.map((m, i) => <p key={i}><small>{m.kind === "lesson" ? `Lesson revision ${m.revision}` : "Verification email"}: {m.state}</small></p>)}</div> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
