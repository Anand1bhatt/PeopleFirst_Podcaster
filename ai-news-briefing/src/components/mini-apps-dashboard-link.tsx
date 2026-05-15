/** Link back to the Mini Apps dashboard (different origin in dev: 3000 vs 3001). */
export function MiniAppsDashboardLink({ className }: { className?: string }) {
  const raw =
    process.env.NEXT_PUBLIC_MINI_APPS_DASHBOARD_URL?.trim() ||
    "http://localhost:3000/dashboard";
  const href = raw.replace(/\/$/, "");
  return (
    <a
      href={href}
      className={
        className ??
        "inline-flex h-11 w-full items-center justify-center rounded-full border-2 border-primary/15 bg-card px-4 text-sm font-semibold text-primary transition-colors hover:border-primary/30 hover:bg-primary/5 sm:h-10 sm:w-auto sm:px-4"
      }
    >
      ← Mini Apps
    </a>
  );
}
