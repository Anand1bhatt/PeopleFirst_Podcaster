import Link from "next/link";

/** Back to Mini Apps home (same app). */
export function MiniAppsDashboardLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={
        className ??
        "inline-flex h-11 w-full items-center justify-center rounded-full border-2 border-primary/15 bg-card px-4 text-sm font-semibold text-primary transition-colors hover:border-primary/30 hover:bg-primary/5 sm:h-10 sm:w-auto sm:px-4"
      }
    >
      ← Mini Apps
    </Link>
  );
}
