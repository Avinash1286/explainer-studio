"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, Images, Loader2, MessageSquare, Monitor, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandMark } from "./brand-mark";
import { isActive, statusLabels, type Job, type StudioView } from "./types";

function startOfToday() { const day=new Date(); day.setHours(0,0,0,0); return day.getTime(); }
function subscribeToDay(callback:()=>void) {
  let timer:ReturnType<typeof setTimeout>;
  const schedule=()=>{clearTimeout(timer);callback();const next=new Date();next.setHours(24,0,0,0);timer=setTimeout(schedule,next.getTime()-Date.now()+20);};
  schedule();document.addEventListener("visibilitychange",schedule);
  return()=>{clearTimeout(timer);document.removeEventListener("visibilitychange",schedule);};
}
function subscribeToViewport(callback:()=>void) { const query=window.matchMedia("(min-width: 768px)");query.addEventListener("change",callback);return()=>query.removeEventListener("change",callback); }
const desktopSnapshot=()=>window.matchMedia("(min-width: 768px)").matches;
const serverDesktop=()=>true;
const serverDay=()=>0;
const focusRing="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

function StatusMark({job}:{job:Job}) {
  const label=statusLabels[job.status];
  return <span className={cn("flex shrink-0 items-center",isActive(job.status)?"text-amber-700":job.status==="failed"?"text-destructive":job.status==="cancelled"?"text-muted-foreground":"text-emerald-700")} title={label}>
    {isActive(job.status)?<Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true"/>:job.status==="failed"?<AlertTriangle className="size-3.5" aria-hidden="true"/>:job.status==="cancelled"?<CircleSlash className="size-3.5" aria-hidden="true"/>:<CheckCircle2 className="size-3.5" aria-hidden="true"/>}
    <span className="sr-only">Status: {label}</span>
  </span>;
}

function ChatGroup({label,jobs,activeJobId,view,onSelect}:{label:string;jobs:Job[];activeJobId:string|null;view:StudioView;onSelect:(id:Job["_id"])=>void}) {
  if(!jobs.length)return null;
  return <section className="mb-2" aria-label={label}>
    <h2 className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</h2>
    <div className="flex flex-col gap-0.5">{jobs.map(job=><button key={job._id} type="button" onClick={()=>onSelect(job._id)} title={job.topic} aria-current={view==="chat"&&job._id===activeJobId?"page":undefined} aria-label={`${job.topic}. Status: ${statusLabels[job.status]}`} className={cn("group flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",focusRing,view==="chat"&&job._id===activeJobId?"bg-sidebar-accent text-sidebar-accent-foreground":"text-sidebar-foreground/80 hover:bg-sidebar-accent/60")}>
      <span className="truncate">{job.topic}</span><span className="ml-auto flex items-center"><StatusMark job={job}/></span>
    </button>)}</div>
  </section>;
}

function RailButton({children,label,onClick,active}:{children:ReactNode;label:string;onClick:()=>void;active?:boolean}) {
  return <Tooltip><TooltipTrigger asChild><button type="button" onClick={onClick} aria-label={label} aria-current={active?"page":undefined} className={cn("flex size-11 items-center justify-center rounded-xl text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent",focusRing,active&&"bg-sidebar-accent text-sidebar-accent-foreground")}>{children}</button></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>;
}

export type SidebarProps = {
  jobs:Job[]|undefined;activeJobId:string|null;view:StudioView;collapsed:boolean;mobileOpen:boolean;
  onCloseMobile:()=>void;onToggleCollapse:()=>void;onNewChat:()=>void;onSelectChat:(id:Job["_id"])=>void;onOpenGallery:()=>void;galleryCount:number;
};

export function Sidebar({jobs,activeJobId,view,collapsed,mobileOpen,onCloseMobile,onToggleCollapse,onNewChat,onSelectChat,onOpenGallery,galleryCount}:SidebarProps) {
  const [query,setQuery]=useState("");
  const searchId=useId();
  const sidebarRef=useRef<HTMLElement>(null),closeButtonRef=useRef<HTMLButtonElement>(null);
  const closeMobileRef=useRef(onCloseMobile);
  const desktop=useSyncExternalStore(subscribeToViewport,desktopSnapshot,serverDesktop);
  const cutoff=useSyncExternalStore(subscribeToDay,startOfToday,serverDay);
  const modalOpen=mobileOpen&&!desktop;
  useEffect(()=>{closeMobileRef.current=onCloseMobile;},[onCloseMobile]);
  useEffect(()=>{if(desktop&&mobileOpen)closeMobileRef.current();},[desktop,mobileOpen]);
  useEffect(()=>{
    if(!modalOpen)return;
    const panel=sidebarRef.current;if(!panel)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const inertElements:Array<{element:HTMLElement;inert:boolean}>=[];
    let branch:HTMLElement=panel;
    while(branch.parentElement){
      const parent=branch.parentElement;
      for(const element of parent.children)if(element instanceof HTMLElement&&element!==branch&&!element.hasAttribute("data-sidebar-backdrop")){inertElements.push({element,inert:element.inert});element.inert=true;}
      if(parent===document.body)break;
      branch=parent;
    }
    const focusable=()=>Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(element=>element.getClientRects().length>0&&getComputedStyle(element).visibility!=="hidden"&&!element.inert);
    const focusFrame=requestAnimationFrame(()=>closeButtonRef.current?.focus());
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();closeMobileRef.current();return;}
      if(event.key!=="Tab")return;
      const items=focusable(),first=items[0],last=items.at(-1);if(!first||!last){event.preventDefault();panel.focus();return;}
      if(!panel.contains(document.activeElement)){event.preventDefault();first.focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    const onFocus=(event:FocusEvent)=>{if(event.target instanceof Node&&!panel.contains(event.target))focusable()[0]?.focus();};
    document.addEventListener("keydown",onKeyDown);document.addEventListener("focusin",onFocus);
    return()=>{cancelAnimationFrame(focusFrame);document.removeEventListener("keydown",onKeyDown);document.removeEventListener("focusin",onFocus);document.body.style.overflow=overflow;for(const {element,inert} of inertElements)element.inert=inert;if(previous?.isConnected&&previous.getClientRects().length)previous.focus();};
  },[modalOpen]);

  const {today,earlier}=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    const list=[...(jobs??[])].filter(job=>!needle||job.topic.toLowerCase().includes(needle)).sort((a,b)=>b.createdAt-a.createdAt);
    return {today:list.filter(job=>job.createdAt>=cutoff),earlier:list.filter(job=>job.createdAt<cutoff)};
  },[jobs,query,cutoff]);
  const newChat=()=>{onCloseMobile();onNewChat();};
  const openGallery=()=>{onCloseMobile();onOpenGallery();};
  const selectChat=(id:Job["_id"])=>{onCloseMobile();onSelectChat(id);};

  return <TooltipProvider delayDuration={200}>
    {collapsed?<aside id="studio-sidebar-rail" aria-label="Studio navigation" className="hidden h-full w-[60px] shrink-0 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar py-3 md:flex">
      <button type="button" onClick={onToggleCollapse} className={cn("mb-1 flex size-11 items-center justify-center rounded-xl hover:bg-sidebar-accent",focusRing)} aria-label="Expand sidebar" aria-controls="studio-sidebar" aria-expanded={false}><BrandMark size={30} id="chalk-sidebar-rail"/></button>
      <RailButton label="New chat" onClick={newChat}><Plus className="size-5" aria-hidden="true"/></RailButton>
      <RailButton label="Gallery" onClick={openGallery} active={view==="gallery"}><Images className="size-5" aria-hidden="true"/></RailButton>
      <RailButton label="Expand sidebar" onClick={onToggleCollapse}><PanelLeftOpen className="size-5" aria-hidden="true"/></RailButton>
    </aside>:null}
    <button type="button" data-sidebar-backdrop="" aria-label="Close navigation" aria-hidden={!modalOpen} tabIndex={-1} onClick={onCloseMobile} className={cn("fixed inset-0 z-40 bg-foreground/30 backdrop-blur-[1px] transition-opacity md:hidden",modalOpen?"pointer-events-auto opacity-100":"pointer-events-none opacity-0")}/>
    <aside ref={sidebarRef} id="studio-sidebar" role={modalOpen?"dialog":undefined} aria-modal={modalOpen?true:undefined} aria-label="Studio navigation" tabIndex={-1} className={cn("fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(88vw,320px)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar shadow-2xl transition-transform duration-200 motion-reduce:transition-none",collapsed?"md:hidden":"md:static md:z-auto md:h-full md:w-[272px] md:translate-x-0 md:shadow-none",modalOpen?"visible translate-x-0":"invisible -translate-x-full",!collapsed&&"md:visible")}>
      <div className="flex min-h-14 items-center gap-2 px-4 pb-1 pt-2 md:pt-4">
        <BrandMark size={30} id="chalk-sidebar-panel"/><span className="text-lg font-semibold tracking-tight text-sidebar-foreground">Chalk</span>
        <Button ref={closeButtonRef} type="button" variant="ghost" size="icon" onClick={onCloseMobile} className="ml-auto size-11 text-muted-foreground md:hidden" aria-label="Close navigation"><X className="size-5" aria-hidden="true"/></Button>
        <Button type="button" variant="ghost" size="icon" onClick={onToggleCollapse} className="ml-auto hidden size-9 text-muted-foreground md:inline-flex" aria-label="Collapse sidebar" aria-controls="studio-sidebar" aria-expanded={!collapsed}><PanelLeftClose className="size-4" aria-hidden="true"/></Button>
      </div>
      <div className="flex flex-col gap-2 px-3 pt-3">
        <Button type="button" variant="outline" onClick={newChat} className="h-11 justify-start gap-2 rounded-xl bg-card font-medium shadow-sm"><Plus className="size-4" aria-hidden="true"/>New chat</Button>
        <button type="button" onClick={openGallery} aria-current={view==="gallery"?"page":undefined} className={cn("flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent",focusRing,view==="gallery"&&"ring-2 ring-ring")}><Images className="size-4" aria-hidden="true"/>Gallery{galleryCount>0?<span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{galleryCount}</span>:null}</button>
      </div>
      <div className="px-3 pt-3"><label htmlFor={searchId} className="sr-only">Search your chats</label><div className="flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-2.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"><Search className="size-4 text-muted-foreground" aria-hidden="true"/><input id={searchId} type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search chats" className="h-full min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"/></div></div>
      <nav aria-label="Chat history" className="scrollbar-thin mt-2 flex-1 overflow-y-auto px-3 pb-2">
        {jobs===undefined?<div role="status" className="flex items-center gap-2 px-2.5 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true"/>Loading…</div>:today.length===0&&earlier.length===0?<div role="status" className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">{query.trim()?<><Search className="size-5" aria-hidden="true"/><span>No chats match your search.</span></>:<><MessageSquare className="size-5" aria-hidden="true"/><span>No chats yet. Start one above.</span></>}</div>:<><ChatGroup label="Today" jobs={today} activeJobId={activeJobId} view={view} onSelect={selectChat}/><ChatGroup label="Earlier" jobs={earlier} activeJobId={activeJobId} view={view} onSelect={selectChat}/></>}
      </nav>
      <div className="border-t border-sidebar-border p-3"><div className="flex items-center gap-2 rounded-lg px-2 py-1.5"><span className="flex size-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Monitor className="size-4" aria-hidden="true"/></span><span className="truncate text-sm font-medium text-sidebar-foreground">Browser workspace</span></div></div>
    </aside>
  </TooltipProvider>;
}
