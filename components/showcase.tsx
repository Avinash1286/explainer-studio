"use client";
import { useQuery } from "convex/react";
import Image from "next/image";
import { ArrowUpRight, Film, Images, Play } from "lucide-react";
import { api } from "@/convex/_generated/api";
export function Showcase() {
  const examples = useQuery(api.showcase.list);
  return <section className="showcase w-full min-w-0 text-foreground" aria-label="Finished example lessons">
    <div className="mb-6 flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Images size={20} aria-hidden="true" /></span>
      <div><h1 className="text-xl font-semibold tracking-tight">See an idea explained</h1><p className="mt-1 text-sm leading-6 text-muted-foreground">Original AI-generated lessons, checked against sources and rendered frames.</p></div>
    </div>
    {examples?.length ? <div className="showcase-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {examples.map(example => <a key={example.slug} href={`/lesson/index.html?example=${example.slug}`} className="group min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" aria-label={`Watch lesson: ${example.title}`}>
        <div className="showcase-image relative flex aspect-video items-center justify-center overflow-hidden bg-secondary">
          {example.poster ? <Image src={example.poster} alt="" fill unoptimized sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 33vw" className="object-cover" /> : <Film size={32} className="text-muted-foreground" aria-hidden="true" />}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/15 group-hover:opacity-100 group-focus-visible:bg-black/15 group-focus-visible:opacity-100"><span className="flex size-11 items-center justify-center rounded-full bg-white/95 text-primary shadow-sm"><Play size={20} aria-hidden="true" /></span></span>
        </div>
        <div className="p-4"><h3 className="break-words text-sm font-semibold leading-6">{example.title}</h3><p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{example.description}</p><span className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium">Watch lesson <ArrowUpRight size={14} aria-hidden="true" /></span></div>
      </a>)}
    </div> : <p role="status" className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">{examples === undefined ? "Loading published examples…" : "Published examples will appear here once a lesson is selected for the showcase."}</p>}
  </section>;
}
