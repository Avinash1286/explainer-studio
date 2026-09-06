"use client";
import { useState } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import Link from "next/link";
import { Showcase } from "./showcase";
import { BrandMark } from "./whiteboard/brand-mark";

export function PublicShowcase() {
  const [client] = useState(() => process.env.NEXT_PUBLIC_CONVEX_URL ? new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL) : null);
  return <main className="mx-auto min-h-dvh max-w-6xl px-5 py-6"><header className="mb-14 flex items-center justify-between gap-4"><Link href="/" className="flex items-center gap-2.5 text-xl font-semibold"><BrandMark size={30} />Chalk</Link><Link href="/chalk/" className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground">Open the studio</Link></header>{client ? <ConvexProvider client={client}><Showcase /></ConvexProvider> : <p role="status" className="rounded-2xl border border-border bg-card p-6 text-muted-foreground">Connect the lesson service to see published examples.</p>}<p className="mt-8 text-sm text-muted-foreground">Published examples are selected individually. Your own lessons stay in your browser’s workspace until you choose to share an approved version.</p></main>;
}
