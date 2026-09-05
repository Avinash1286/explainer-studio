import type { Metadata } from "next";
import { SharedLesson } from "@/components/shared-lesson";
export const metadata: Metadata = { title: "Shared lesson · Explainer Studio", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function LessonPage() { return <SharedLesson />; }
