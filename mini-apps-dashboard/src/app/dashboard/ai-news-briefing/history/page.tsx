"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";

type Section = { key: string; title: string; blurb: string; articles: unknown[] };
type Item = { date: string; lang: string; day_summary: string; sections: Section[] };

function HistoryContent() {
  const searchParams = useSearchParams();
  const lang = searchParams.get("lang") === "hi" ? "hi" : "en";
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/figma-digest-history?lang=${lang}&limit=40`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error ?? "Failed to load");
        setItems([]);
        return;
      }
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch {
      setErr("Could not reach server");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-12 pt-16">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="flex size-10 items-center justify-center rounded-full border border-[#e5f1f7] text-[#013e7c] hover:bg-[#eef6fb]"
          aria-label="Back to home"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-[#141414]">Briefing history</h1>
          <p className="text-xs text-black/55">Saved daily digests</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <Link
          href="/dashboard/ai-news-briefing/history?lang=en"
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            lang === "en"
              ? "bg-[#0078ad] text-white"
              : "bg-[#f5fafd] text-[#013e7c] ring-1 ring-[#e5f1f7]"
          }`}
        >
          English
        </Link>
        <Link
          href="/dashboard/ai-news-briefing/history?lang=hi"
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            lang === "hi"
              ? "bg-[#0078ad] text-white"
              : "bg-[#f5fafd] text-[#013e7c] ring-1 ring-[#e5f1f7]"
          }`}
        >
          हिंदी
        </Link>
      </div>

      {err && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {err}
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-black/50">
          <Loader2 className="size-5 animate-spin text-[#0078ad]" />
          Loading…
        </div>
      )}

      {!loading && items.length === 0 && !err && (
        <p className="text-sm text-black/55">
          No saved summaries yet. Open the Figma home, use{" "}
          <strong>Refresh</strong> on the news feed, then return here.
        </p>
      )}

      <ul className="space-y-2">
        {items.map((it) => (
          <li key={`${it.date}-${it.lang}`}>
            <button
              type="button"
              onClick={() => setSelected(it)}
              className="w-full rounded-xl border border-[#e5f1f7] bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-[#f9fafc]"
            >
              <p className="text-sm font-bold text-[#141414]">{it.date}</p>
              <p className="mt-1 line-clamp-2 text-xs text-black/65">
                {it.day_summary}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-2">
              <h2 className="text-base font-bold text-[#141414]">
                {selected.date}
              </h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg px-2 py-1 text-sm font-medium text-[#0078ad]"
              >
                Close
              </button>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-[#141414]">
              {selected.day_summary}
            </p>
            <div className="space-y-4 border-t border-[#e5f1f7] pt-4">
              {selected.sections.map((s) => (
                <div key={s.key}>
                  <h3 className="text-xs font-bold uppercase text-[#013e7c]">
                    {s.title}
                  </h3>
                  <p className="mt-1 text-sm text-black/80">{s.blurb}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BriefingHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-black/50">
          Loading…
        </div>
      }
    >
      <HistoryContent />
    </Suspense>
  );
}
