import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AI News Podcast",
  description: "Generate a short audio podcast from news URLs or text",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0078ad",
};

export default function BriefingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
