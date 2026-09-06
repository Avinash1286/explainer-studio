import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/whiteboard/brand-mark";

const STRIP_ICONS = ["rocket", "brain", "chart", "globe", "lock", "server", "shield", "clock", "wallet", "network", "coin", "document", "learning", "warning", "database", "timeline"] as const;
type DoodleName = typeof STRIP_ICONS[number];
// Public showcase:list returned this approved example and its poster. The
// lesson route remains the authority for playback, captions and source links.
const SOLAR_EXAMPLE = {
  href: "/lesson/index.html?example=solar-cells",
  title: "How Solar Cells Turn Sunlight into Electricity",
  poster: "https://wooden-pheasant-677.convex.cloud/api/storage/4577e9b6-b102-4794-a588-9cf4931a4a4b",
};
const STEPS: { icon: DoodleName; title: string; body: string }[] = [
  { icon: "document", title: "Type one line", body: "“Explain how solar cells work.” Start with a question, choose your audience, and let Chalk shape the explanation." },
  { icon: "brain", title: "Agents research & design", body: "Sources inform the narration. A visual director chooses illustrations and plans how each scene unfolds with the spoken words." },
  { icon: "clock", title: "Watch the finished video", body: "Chalk renders the narration and animation, checks the result, and brings you a completed MP4 with captions and sources." },
];
const FEATURES: { icon: DoodleName; title: string; body: string }[] = [
  { icon: "learning", title: "Scripts grounded in sources", body: "A focused explanation built from researched material, with source links kept alongside the finished lesson." },
  { icon: "rocket", title: "A library made for explaining", body: "Vetted sketch and flat illustrations sit alongside purpose-built shapes for particles, structures, and changing states." },
  { icon: "network", title: "Deterministic animation", body: "Scene plans become measured layouts, meaningful connections, and deliberate movement through a consistent renderer." },
  { icon: "chart", title: "Visuals timed to speech", body: "Measured spoken-word timing aligns illustration reveals and movement with the narration." },
  { icon: "clock", title: "A video you can keep", body: "Play the completed MP4, follow the captions, or download the lesson to share beyond the studio." },
  { icon: "shield", title: "Review before it’s ready", body: "Factual checks and rendered-frame reviews help catch issues. Saved checkpoints support targeted repairs and recovery." },
];
const solidButton = "inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-foreground/85 bg-primary px-6 py-3 font-medium text-primary-foreground shadow-[4px_4px_0_0_rgb(0_0_0/15%)] transition-transform hover:-translate-y-0.5 motion-reduce:transform-none";

function Doodle({ name, size = 44, className }: { name: DoodleName; size?: number; className?: string }) {
  return <Image src={`/ui-icons/${name}.svg`} alt="" width={size} height={size} unoptimized className={cn("select-none", className)} aria-hidden="true" />;
}
function SketchCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border-2 border-foreground/85 bg-card p-6 shadow-[5px_5px_0_0_rgb(0_0_0/12%)]", className)}>{children}</div>;
}

export function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-background text-foreground">
      <a href="#landing-content" className="sr-only fixed left-3 top-3 z-50 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground focus:not-sr-only">Skip to content</a>
      <div className="pointer-events-none fixed inset-0 opacity-[0.35]" style={{ backgroundImage: "linear-gradient(to right, oklch(0.92 0.004 265 / 40%) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.92 0.004 265 / 40%) 1px, transparent 1px)", backgroundSize: "44px 44px" }} aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl px-5">
        <header className="flex items-center justify-between gap-3 py-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="Chalk home">
            <BrandMark size={30} id="chalk-landing-header" />
            <span className="font-marker text-2xl">Chalk</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Main navigation">
            <a href="#how" className="hidden min-h-11 items-center rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground sm:inline-flex">How it works</a>
            <a href="#demo" className="hidden min-h-11 items-center rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground sm:inline-flex">Demo</a>
            <Link href="/showcase/" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border-2 border-foreground/85 bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-[3px_3px_0_0_rgb(0_0_0/15%)] transition-transform hover:-translate-y-0.5 motion-reduce:transform-none sm:px-4 sm:text-sm"><span className="hidden sm:inline">Open&nbsp;</span>showcase</Link>
            <Link href="/chalk/" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border-2 border-foreground/85 bg-background px-3 py-2 text-xs font-medium shadow-[3px_3px_0_0_rgb(0_0_0/10%)] transition-transform hover:-translate-y-0.5 hover:bg-accent motion-reduce:transform-none sm:px-4 sm:text-sm"><span className="hidden sm:inline">Open&nbsp;</span>studio</Link>
          </nav>
        </header>

        <section id="landing-content" tabIndex={-1} className="grid scroll-mt-5 items-center gap-10 py-14 outline-none lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"><Doodle name="rocket" size={16} /> AI whiteboard explainer videos</p>
            <h1 className="font-marker text-5xl leading-[1.05] sm:text-6xl lg:text-7xl">
              Type a prompt.<br />Watch it{" "}
              <span className="relative inline-block">explain itself.
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 220 12" fill="none" aria-hidden="true"><path d="M3 8 C 60 2, 150 12, 217 5" stroke="#ffd43b" strokeWidth="7" strokeLinecap="round" /></svg>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Chalk</span> turns a question into a useful video that teaches and explains.</p>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">One line in. A narrated, illustrated whiteboard video out: researched narration, clear scenes, and visuals timed to the spoken words.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/chalk/" className={solidButton}>Open the studio</Link>
              <a href="#demo" className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-foreground/85 bg-card px-6 py-3 font-medium shadow-[4px_4px_0_0_rgb(0_0_0/10%)] transition-transform hover:-translate-y-0.5 motion-reduce:transform-none">Watch the demo</a>
            </div>
          </div>
          <figure className="relative">
            <Doodle name="brain" size={54} className="absolute -left-6 -top-8 -rotate-6" />
            <Doodle name="chart" size={48} className="absolute -right-4 -top-10 rotate-6" />
            <Doodle name="globe" size={50} className="absolute -bottom-5 -left-8 rotate-3" />
            <div className="rotate-1 overflow-hidden rounded-2xl border-2 border-foreground/85 bg-card shadow-[8px_8px_0_0_rgb(0_0_0/12%)]">
              <Image src="/landing/ss.png" alt="Chalk studio interface with a prompt composer and lesson sidebar" width={1365} height={571} unoptimized loading="eager" fetchPriority="high" sizes="(max-width: 1023px) 100vw, 50vw" className="h-auto w-full" />
            </div>
            <figcaption className="mt-5 text-center text-xs text-muted-foreground">Studio interface</figcaption>
          </figure>
        </section>

        <section className="py-8" aria-label="Illustration library">
          <SketchCard className="flex flex-col items-center gap-4 py-5">
            <div className="flex flex-wrap items-center justify-center gap-4">{STRIP_ICONS.map(name => <Doodle key={name} name={name} size={40} className="transition-transform hover:-translate-y-1 motion-reduce:transform-none" />)}</div>
            <p className="text-center text-sm text-muted-foreground">A few drawings from Chalk’s curated illustration library. Familiar objects help make ideas easier to follow.</p>
          </SketchCard>
        </section>

        <section id="how" className="scroll-mt-8 py-16">
          <h2 className="font-marker text-center text-4xl sm:text-5xl">How it works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => <SketchCard key={step.title} className={index === 1 ? "md:-rotate-1" : "md:rotate-1"}>
              <div className="flex items-center gap-3"><Doodle name={step.icon} size={42} /><span className="font-marker text-sm text-muted-foreground">Step {index + 1}</span></div>
              <h3 className="mt-3 font-marker text-2xl">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </SketchCard>)}
          </div>
        </section>

        <section id="demo" className="scroll-mt-8 py-16">
          <h2 className="font-marker text-center text-4xl sm:text-5xl">Watch an idea become a lesson</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-muted-foreground">Prompt: &ldquo;How do solar cells work?&rdquo; Explore a completed lesson with narration, captions, and sources.</p>
          <Link href={SOLAR_EXAMPLE.href} className="group mx-auto mt-8 block max-w-3xl overflow-hidden rounded-2xl border-2 border-foreground/85 bg-card shadow-[8px_8px_0_0_rgb(0_0_0/12%)]" aria-label={`Watch ${SOLAR_EXAMPLE.title}`}>
            <div className="relative aspect-video overflow-hidden bg-white">
              <Image src={SOLAR_EXAMPLE.poster} alt="Preview frame from the solar-cell lesson" width={1280} height={720} unoptimized sizes="(max-width: 767px) 100vw, 768px" className="h-full w-full object-contain" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/5 transition-colors group-hover:bg-black/10" aria-hidden="true"><span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-foreground/85 bg-primary text-primary-foreground shadow-[4px_4px_0_0_rgb(0_0_0/15%)]"><svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span></span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-5"><h3 className="font-marker text-2xl">{SOLAR_EXAMPLE.title}</h3><span className="text-sm font-semibold">Watch lesson <span aria-hidden="true">→</span></span></div>
          </Link>
          <p className="mt-6 text-center text-sm text-muted-foreground"><Link href="/showcase/" className="rounded underline decoration-border underline-offset-4 hover:text-foreground">Explore the showcase</Link></p>
        </section>

        <section className="py-16">
          <h2 className="font-marker text-center text-4xl sm:text-5xl">Built to explain</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{FEATURES.map(feature => <SketchCard key={feature.title}><Doodle name={feature.icon} size={44} /><h3 className="mt-3 font-marker text-2xl">{feature.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p></SketchCard>)}</div>
        </section>

        <section className="py-16">
          <SketchCard className="flex flex-col items-center gap-5 bg-primary py-12 text-primary-foreground">
            <h2 className="max-w-2xl text-center font-marker text-4xl leading-tight sm:text-5xl">The next thing you have to explain — let Chalk draw it.</h2>
            <Link href="/chalk/" className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-primary-foreground/90 bg-background px-7 py-3 font-medium text-foreground shadow-[4px_4px_0_0_rgb(255_255_255/20%)] transition-transform hover:-translate-y-0.5 motion-reduce:transform-none">Open the studio</Link>
          </SketchCard>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-border py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2"><BrandMark size={22} id="chalk-landing-footer" /><span className="font-marker text-lg text-foreground">Chalk</span></div>
          <p>Useful videos that teach and explain.</p>
        </footer>
      </div>
    </main>
  );
}
