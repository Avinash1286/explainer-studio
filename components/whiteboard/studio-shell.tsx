"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleHelp, Layers3, Loader2, Menu, Sparkles, X } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { PIPELINE_STAGES } from "@/packages/contracts";
import { PROVIDER_LABELS, type GenerationProvider } from "@/packages/contracts/provider";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { friendlyError, StudioToast } from "@/components/studio-toast";
import { BrandMark } from "./brand-mark";
import { Composer, type ProviderAvailability } from "./composer";
import { Sidebar } from "./sidebar";
import { GalleryView } from "./gallery-view";
import { type Job, statusLabels, isActive } from "./types";

export type Brief = { topic: string; duration: number; audience: "beginner" | "student"; generationProvider: GenerationProvider; requestId: string };
type Notification = { id: string; message: string };
const suggestions = ["Explain how credit scores work", "How does the water cycle work?", "Why is the sky blue?", "How does a solar panel work?"];
const subscribeLocation = (callback: () => void) => { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback); };
const readLocation = () => window.location.search;
const serverLocation = () => "";
function focusComposer() { window.requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[data-topic-composer]")?.focus()); }

export function Studio({ jobs, ready, connectionMessage, save, cancel, sample, resultPanel, generate, providers, checkProvider, token }: {
  jobs: Job[]; ready: boolean; connectionMessage: string; providers?: ProviderAvailability; token?: string | null;
  checkProvider?: (generationProvider: GenerationProvider) => Promise<void>;
  generate?: (jobId: Id<"jobs">) => Promise<void>; save?: (brief: Brief) => Promise<Id<"jobs">>;
  cancel?: (id: Id<"jobs">) => Promise<void>; sample?: (requestId: string) => Promise<Id<"jobs">>;
  resultPanel?: (jobId: Id<"jobs">, onError: (error: unknown) => void) => ReactNode;
}) {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(75);
  const [audience, setAudience] = useState<"beginner" | "student">("beginner");
  const [generationProvider, setGenerationProvider] = useState<GenerationProvider>("nim");
  const draftRevision = useRef(0), navigationRevision = useRef(0), mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const navigated = () => { navigationRevision.current += 1; };
    window.addEventListener("popstate", navigated);
    window.addEventListener("hashchange", navigated);
    return () => { mounted.current = false; window.removeEventListener("popstate", navigated); window.removeEventListener("hashchange", navigated); };
  }, []);
  const location = useSyncExternalStore(subscribeLocation, readLocation, serverLocation);
  const search = new URLSearchParams(location), selectedId = search.get("job"), view = search.get("view") === "gallery" ? "gallery" : "chat";
  const [busy, setBusy] = useState(false), inFlight = useRef(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingBrief, setPendingBrief] = useState<Brief | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [sampleRequest, setSampleRequest] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false), [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const selected = jobs.find(job => job._id === selectedId);
  const selectedProvider = selected?.generationProvider ?? "nim";
  const saveBriefOnly = generationProvider === "nim" && Boolean(providers) && !providers?.nim.enabled;
  const failedNotice = selected?.status === "failed" ? { id: `${selected._id}:${selected.updatedAt}`, message: selected.stageMessage } : null;
  const toast = notification && !dismissed.has(notification.id) ? notification : failedNotice && !dismissed.has(failedNotice.id) ? failedNotice : null;
  function reportError(error: unknown) { setNotification({ id: crypto.randomUUID(), message: friendlyError(error) }); }
  function changeTopic(value: string) { draftRevision.current += 1; setTopic(value); }
  function changeDuration(value: number) { draftRevision.current += 1; setDuration(value); }
  function changeAudience(value: "beginner" | "student") { draftRevision.current += 1; setAudience(value); }
  function openAIUnavailable(provider: GenerationProvider) {
    if (provider !== "openai" || !providers || providers.openai.enabled) return false;
    setNotification({ id: crypto.randomUUID(), message: providers.openai.message });
    return true;
  }
  function captureIntent() {
    const draft = draftRevision.current, navigation = navigationRevision.current, href = window.location.href;
    return {
      sameDraft: () => mounted.current && draftRevision.current === draft,
      sameDestination: () => mounted.current && draftRevision.current === draft && navigationRevision.current === navigation && window.location.href === href,
    };
  }
  function select(id: string | null, nextView = "chat") {
    setNotification(null); setMobileOpen(false);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("job", id); else url.searchParams.delete("job");
    if (nextView === "gallery" || (url.pathname === "/" && !id)) url.searchParams.set("view", nextView); else url.searchParams.delete("view");
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  function newChat() { select(null); changeTopic(""); setPendingBrief(null); focusComposer(); }
  function chooseProvider(provider: GenerationProvider) {
    draftRevision.current += 1;
    setGenerationProvider(provider); setNotification(null);
    if (providers && !providers[provider].enabled) setNotification({ id: crypto.randomUUID(), message: providers[provider].message });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!save || !ready || inFlight.current || !providers) return;
    if (openAIUnavailable(generationProvider)) return;
    inFlight.current = true; setBusy(true); setNotification(null);
    const intent = captureIntent();
    const brief = pendingBrief?.topic === topic && pendingBrief.duration === duration && pendingBrief.audience === audience && pendingBrief.generationProvider === generationProvider ? pendingBrief : { topic, duration, audience, generationProvider, requestId: crypto.randomUUID() };
    setPendingBrief(brief);
    try {
      if (!saveBriefOnly) await checkProvider?.(generationProvider);
      const id = await save(brief);
      // Finish the requested work while keeping newer drafts and navigation intact.
      if (intent.sameDestination()) select(id);
      if (!saveBriefOnly) await generate?.(id);
      if (mounted.current) setPendingBrief(current => current?.requestId === brief.requestId ? null : current);
      if (intent.sameDraft()) setTopic("");
    } catch (error) { if (mounted.current) reportError(error); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function operate(work: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotification(null);
    try { await work(); } catch (error) { reportError(error); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function renderSample() {
    if (!sample || !ready || inFlight.current) return;
    const intent = captureIntent();
    const requestId = sampleRequest || crypto.randomUUID(); setSampleRequest(requestId);
    void operate(async () => { const id = await sample(requestId); if (intent.sameDestination()) select(id); if (mounted.current) setSampleRequest(null); });
  }
  const composer = <Composer prompt={topic} onPromptChange={changeTopic} duration={duration} onDurationChange={changeDuration} audience={audience} onAudienceChange={changeAudience} provider={generationProvider} onProviderChange={chooseProvider} providers={providers} onSubmit={submit} disabled={!ready || !providers} submitting={busy} saveBriefOnly={saveBriefOnly} placeholder={selectedId ? "Start a new explanation…" : undefined} />;
  const currentStage = selected ? PIPELINE_STAGES.findIndex(stage => stage.id === selected.status) : -1;
  return <TooltipProvider delayDuration={250}><div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
    <a href="#studio-main" className="sr-only fixed left-3 top-3 z-[70] rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground focus:not-sr-only">Skip to content</a>
    {toast ? <StudioToast key={toast.id} message={toast.message} onDismiss={() => setDismissed(current => new Set(current).add(toast.id))} /> : null}
    <Sidebar jobs={ready ? jobs : undefined} activeJobId={selectedId} view={view} collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={closeMobile} onToggleCollapse={() => setCollapsed(value => !value)} onNewChat={newChat} onSelectChat={id => select(id)} onOpenGallery={() => select(null, "gallery")} galleryCount={jobs.filter(job => job.status === "completed").length} />
    <main id="studio-main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-hidden outline-none">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-3 md:hidden"><Button variant="ghost" size="icon" className="size-11" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="studio-sidebar"><Menu /></Button><BrandMark size={25} id="studio-mobile-brand" /><span className="truncate text-sm font-semibold">{view === "gallery" ? "Gallery" : selected?.topic || "Chalk"}</span></header>
      {view === "gallery" ? <GalleryView jobs={jobs} ready={ready} token={token} onOpen={id => select(id)} /> : selectedId ? <div className="flex min-h-0 flex-1 flex-col">
        <div className="scrollbar-thin flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-5 sm:px-6 sm:py-8">
          {!ready ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading lesson…</p> : !selected ? <div className="rounded-2xl border border-border bg-card p-6"><h1 className="text-lg font-semibold">Lesson unavailable in this workspace</h1><p className="mt-2 text-sm text-muted-foreground">Open a lesson from the sidebar or start a new explanation.</p><Button className="mt-4" onClick={newChat}>New chat</Button></div> : <>
            <div className="flex justify-end"><h1 className="max-w-[90%] rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-base leading-relaxed text-primary-foreground">{selected.topic}</h1></div>
            <div className="flex gap-2 sm:gap-3"><BrandMark size={30} className="mt-1 shrink-0" id="studio-response-brand" /><div className="min-w-0 flex-1 space-y-4">
              <span role="status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${selected.status === "completed" ? "bg-emerald-500/12 text-emerald-700" : selected.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-amber-500/12 text-amber-700"}`}>{selected.status === "completed" ? <CheckCircle2 className="size-3.5" /> : isActive(selected.status) ? <Loader2 className="size-3.5 animate-spin" /> : <AlertTriangle className="size-3.5" />}{statusLabels[selected.status]}</span>
              <div className="space-y-3 rounded-2xl border border-border bg-card p-4"><p role="status" className="text-sm leading-6">{selected.stageMessage}</p>{currentStage >= 0 ? <ol aria-label="Generation stages" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PIPELINE_STAGES.map((stage, index) => <li key={stage.id} aria-current={index === currentStage ? "step" : undefined} className={`rounded-xl border px-2.5 py-2 text-xs ${index === currentStage ? "border-primary bg-primary/5 font-semibold" : "border-border text-muted-foreground"}`}><span className="mr-1">{index < currentStage ? "✓" : index + 1}</span>{stage.label}</li>)}</ol> : null}<p className="text-xs text-muted-foreground">{selected.isSample ? "Scripted demo" : PROVIDER_LABELS[selectedProvider]} · {Math.round(selected.duration)}s · {selected.audience === "student" ? "School student" : "Curious beginner"}</p></div>
              {resultPanel?.(selected._id, reportError)}
              {selected.status === "queued" && !selected.isSample ? <Button disabled={busy || !providers} onClick={() => { if (generate && !openAIUnavailable(selectedProvider)) void operate(async () => { await checkProvider?.(selectedProvider); await generate(selected._id); }); }}>Generate this lesson<ArrowRight /></Button> : null}
              {selected.status !== "completed" && selected.status !== "cancelled" && selected.status !== "failed" ? <Button variant="ghost" disabled={busy} onClick={() => { if (cancel) void operate(() => cancel(selected._id)); }}><X />Cancel this lesson</Button> : null}
            </div></div>
          </>}
        </div></div>
        <div className="shrink-0 border-t border-border bg-background/95 px-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]"><div className="mx-auto max-w-2xl">{composer}</div></div>
      </div> : <div className="scrollbar-thin flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-8 sm:py-10"><div className="my-auto w-full max-w-2xl py-5">
        <div className="mb-6 flex flex-col items-center text-center sm:mb-8"><BrandMark size={92} className="mb-4 size-16 sm:mb-6 sm:size-[92px]" id="studio-hero-brand" /><h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">What should Chalk make clear?</h1><p className="mt-4 max-w-md text-base leading-6 text-muted-foreground">Start with a concept or a question that needs a visual explanation. Chalk researches the idea, designs each scene, narrates it, and renders a whiteboard video.</p><ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground" aria-label="What to expect"><li>Source-backed scripts</li><li>Toggle captions</li><li>Downloadable MP4</li></ul></div>
        {composer}
        <div className="mt-4 flex flex-wrap justify-center gap-2">{suggestions.map(suggestion => <button type="button" key={suggestion} onClick={() => { changeTopic(suggestion); focusComposer(); }} className="flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"><Sparkles className="size-3 shrink-0" />{suggestion}</button>)}</div>
        <p role="status" className="mt-5 text-center text-xs text-muted-foreground">{connectionMessage}{busy ? " · Preparing your lesson…" : ""}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="ghost" size="sm" onClick={() => setShowInfo(value => !value)} aria-expanded={showInfo}><CircleHelp />How it works</Button><Button variant="ghost" size="sm" asChild><Link href="/showcase/">Watch an example<ArrowRight /></Link></Button></div>
        {showInfo ? <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-5 text-sm leading-6 text-muted-foreground">
          <h2 className="font-semibold text-foreground">From one question to a visual lesson</h2>
          <p>Choose a provider, lesson length and audience. Your lesson is researched, narrated and animated, then checked against sources and sampled video frames. Scene edits, share links and optional email delivery become available in the lesson thread.</p>
          <p>Try the fixed plant-energy demo to see the renderer without a topic-planning request.</p>
          <Button variant="outline" onClick={renderSample} disabled={!ready || busy}><Layers3 />Render scripted demo</Button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- A document navigation resets the legacy /?job workspace and its location subscription. */}
          <a href="/" className="ml-3 underline underline-offset-4">About Chalk</a>
        </section> : null}
      </div></div>}
    </main>
  </div></TooltipProvider>;
}
