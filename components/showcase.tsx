"use client";
import { useQuery } from "convex/react";
import Image from "next/image";
import { api } from "@/convex/_generated/api";
export function Showcase() {
  const examples = useQuery(api.showcase.list);
  if (!examples?.length) return null;
  return <section className="showcase" aria-label="Finished example lessons"><h2>See an idea explained</h2><p>Original AI-generated lessons, checked against sources and rendered frames.</p><div className="showcase-grid">{examples.map(example => <a key={example.slug} href={`/lesson/index.html?example=${example.slug}`}><div className="showcase-image">{example.poster ? <Image src={example.poster} alt="" fill unoptimized sizes="(max-width: 700px) 100vw, 33vw" /> : null}</div><h3>{example.title}</h3><p>{example.description}</p><span>Watch lesson →</span></a>)}</div></section>;
}
