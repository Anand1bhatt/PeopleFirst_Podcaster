/** Full-bleed Figma journey — no main dashboard chrome */
export default function AiNewsBriefingJourneyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#f0f4f8]">
      {children}
    </div>
  );
}
