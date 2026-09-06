"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Film, Images, Loader2, Play, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { Job } from "./types";

type Media = FunctionReturnType<typeof api.media.result>;
const formatDuration=(seconds:number)=>{const value=Math.max(1,Math.round(seconds));return `${Math.floor(value/60)}:${String(value%60).padStart(2,"0")}`;};

function GalleryCard({job,onOpen,media,loading=false}:{job:Job;onOpen:(id:Job["_id"])=>void;media?:Media;loading?:boolean}) {
  const videoRef=useRef<HTMLVideoElement>(null);
  const playable=media?.approved?media:null;
  const stopPreview=()=>{const video=videoRef.current;if(video){video.pause();try{video.currentTime=0;}catch{/* Media can still be loading. */}}};
  const duration=playable?.durationSeconds??job.duration;
  return <button type="button" onClick={()=>onOpen(job._id)} title={job.topic} aria-label={`Open video: ${job.topic}. Your video. ${formatDuration(duration)}`} onMouseEnter={()=>{if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const video=videoRef.current;if(video&&playable?.video)void video.play().catch(()=>{});}} onMouseLeave={stopPreview} onBlur={stopPreview} className={cn("group flex min-h-11 flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none","focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2")}>
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      {playable?.poster||playable?.video?<video ref={videoRef} src={playable.video??undefined} poster={playable.poster??undefined} muted playsInline preload="none" tabIndex={-1} aria-hidden="true" className="size-full object-cover"/>:<div className="flex size-full flex-col items-center justify-center gap-2 bg-secondary text-muted-foreground">{loading?<Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true"/>:<Film className="size-8" aria-hidden="true"/>}<span className="text-xs">{loading?"Loading preview…":"Preview unavailable"}</span></div>}
      <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100 group-focus-visible:bg-black/20 group-focus-visible:opacity-100"><span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-primary"><Play className="size-5" aria-hidden="true"/></span></span>
      <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">{formatDuration(duration)}</span>
    </div>
    <div className="p-3"><p className="line-clamp-2 text-sm font-medium text-foreground">{job.topic}</p><div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><span className="truncate">{job.isSample?"Scripted demo":"Your video"}</span><span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">You</span></div></div>
  </button>;
}

function ConnectedGalleryCard({job,onOpen,token}:{job:Job;onOpen:(id:Job["_id"])=>void;token:string}) {
  const media=useQuery(api.media.result,{token,jobId:job._id});
  return <GalleryCard job={job} onOpen={onOpen} media={media} loading={media===undefined}/>;
}

export type GalleryViewProps={jobs:Job[]|undefined;onOpen:(id:Job["_id"])=>void;ready:boolean;token?:string|null};
export function GalleryView({jobs,onOpen,ready,token}:GalleryViewProps) {
  const [query,setQuery]=useState("");
  const searchId=useId();
  const done=useMemo(()=>(jobs??[]).filter(job=>job.status==="completed"),[jobs]);
  const needle=query.trim().toLowerCase();
  const matching=done.filter(job=>!needle||job.topic.toLowerCase().includes(needle));
  const loaded=ready&&jobs!==undefined;
  return <div className="scrollbar-thin h-full overflow-y-auto"><div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Images className="size-5" aria-hidden="true"/></span><div><h1 className="text-xl font-semibold tracking-tight text-foreground">Gallery</h1><p className="text-sm text-muted-foreground">{!loaded?"Loading finished videos…":`${done.length} finished video${done.length===1?"":"s"}`}</p></div></div><div className="w-full sm:w-64"><label htmlFor={searchId} className="sr-only">Search your videos</label><div className="flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-2.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"><Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/><input id={searchId} type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search videos" className="h-full min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"/></div></div></div>
    {!loaded?<div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-20 text-sm text-muted-foreground"><Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true"/>Loading your gallery…</div>:matching.length===0?<div role="status" className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-6 py-20 text-center">{needle?<Search className="size-8 text-muted-foreground" aria-hidden="true"/>:<Film className="size-8 text-muted-foreground" aria-hidden="true"/>}<p className="text-sm text-muted-foreground">{needle?"No videos match your search.":"Your completed videos will appear here. Start a new chat to create one."}</p></div>:<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{matching.map(job=>token?<ConnectedGalleryCard key={job._id} job={job} onOpen={onOpen} token={token}/>:<GalleryCard key={job._id} job={job} onOpen={onOpen}/>)}</div>}
  </div></div>;
}
