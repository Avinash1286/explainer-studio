"use client";
import { useState, useSyncExternalStore } from "react";
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { BrandMark } from "./whiteboard/brand-mark";
const readExample = () => new URLSearchParams(window.location.search).get("example") || "";
const subscribe = () => () => {};
const readToken = () => new URLSearchParams(window.location.search).get("share") || "";
export function SharedLesson() {
  const [client] = useState(() => process.env.NEXT_PUBLIC_CONVEX_URL ? new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL) : null);
  return client ? <ConvexProvider client={client}><Lesson /></ConvexProvider> : <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm"><h1 className="text-xl font-semibold">Lesson service is unavailable.</h1><Link href="/chalk/" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><ArrowLeft size={16} aria-hidden="true" />Explainer Studio</Link></div></main>;
}
function Lesson() {
  const token = useSyncExternalStore(subscribe, readToken, () => "");
  const slug = useSyncExternalStore(subscribe, readExample, () => "");
  const shared = useQuery(api.delivery.shared, token ? { token } : "skip");
  const example = useQuery(api.showcase.get, slug ? { slug } : "skip");
  const lesson = slug ? example : shared;
  return <div className="min-h-dvh bg-background text-foreground">
    <a href="#shared-lesson-content" className="sr-only fixed top-3 left-3 z-50 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground focus:not-sr-only">Skip to lesson</a>
    <header className="border-b border-border bg-card/80"><div className="mx-auto flex min-h-16 w-full max-w-4xl items-center px-4 sm:px-6"><Link href="/chalk/" className="inline-flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-sm font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><BrandMark size={28} id="shared-lesson-brand" />Explainer Studio</Link></div></header>
    <main id="shared-lesson-content" tabIndex={-1} className="shared-lesson mx-auto w-full max-w-4xl px-4 py-8 outline-none sm:px-6 sm:py-12">
      {lesson === undefined && (token || slug) ? <p role="status" aria-live="polite" className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 py-16 text-sm text-muted-foreground"><Loader2 size={18} className="animate-spin" aria-hidden="true" />Loading lesson…</p> : !lesson ? <section className="rounded-2xl border border-border bg-card px-5 py-16 text-center shadow-sm"><h1 className="text-2xl font-semibold tracking-tight">Lesson link unavailable</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">This link may have expired or be incomplete.</p></section> : <>
        <h1 className="break-words text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{lesson.title}</h1>
        <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-muted-foreground"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />Revision {lesson.revision} · Passed automated source and sampled-frame review</p>
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-black shadow-sm"><video controls playsInline preload="metadata" className="aspect-video w-full" src={lesson.video || undefined} crossOrigin="anonymous" aria-label={lesson.title}>{lesson.captions ? <track kind="captions" src={lesson.captions} srcLang="en" label="English" /> : null}</video></div>
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-label="Lesson sources"><h2 className="text-base font-semibold">Sources</h2><ul className="mt-3 divide-y divide-border">{lesson.sources.map(s => <li key={s.url}><a href={s.url} rel="noreferrer" target="_blank" className="flex min-h-11 items-start gap-2 rounded-lg py-3 text-sm leading-6 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><span className="min-w-0 flex-1 break-words">{s.title}</span><ExternalLink size={15} className="mt-1 shrink-0" aria-hidden="true" /></a></li>)}</ul></section>
        <p className="mt-6 text-xs leading-6 text-muted-foreground">Original diagrams and catalog artwork. <a className="underline underline-offset-4 hover:text-foreground" href="https://openmoji.org/" rel="noreferrer">OpenMoji</a> assets: <a className="underline underline-offset-4 hover:text-foreground" href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noreferrer">CC BY-SA 4.0</a>. <a className="underline underline-offset-4 hover:text-foreground" href="/lesson-assets/NOTICE.md">Artwork credits</a>.</p>
      </>}
    </main>
  </div>;
}
