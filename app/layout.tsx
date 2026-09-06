import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chalk — Explainer Studio",
  description: "Turn a question into a clear, illustrated lesson with sources you can follow.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
