export default function FigmaHomeLayout({
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
