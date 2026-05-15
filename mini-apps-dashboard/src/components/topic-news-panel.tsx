"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SourceEntry } from "./source-input";

type ArticleRow = { url: string; title: string; source: string };

type Props = {
  sources: SourceEntry[];
  onAppendSources: (entries: SourceEntry[]) => void;
  disabled?: boolean;
  className?: string;
};

export function TopicNewsPanel({ sources, onAppendSources, disabled, className }: Props) {
  const [topic, setTopic] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [addFeedback, setAddFeedback] = useState<string | null>(null);

  const existingUrls = new Set(
    sources.filter((s) => s.type === "url").map((s) => s.value.trim())
  );

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    setSuggestionsError(null);
    try {
      const res = await fetch("/api/news/suggestions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setSuggestionsError(data.error ?? "Could not load suggestions");
        setSuggestions([]);
        return;
      }
      setSuggestions(Array.isArray(data.topics) ? data.topics : []);
    } catch {
      setSuggestionsError("Network error loading suggestions");
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const searchArticles = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) {
      setArticlesError("Enter a topic or pick a suggestion.");
      return;
    }
    setLoadingArticles(true);
    setArticlesError(null);
    setAddFeedback(null);
    try {
      const res = await fetch(
        `/api/news/articles?q=${encodeURIComponent(query)}&limit=8`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        setArticles([]);
        setSelectedUrls(new Set());
        setArticlesError(data.error ?? "Search failed");
        return;
      }
      const list: ArticleRow[] = Array.isArray(data.articles) ? data.articles : [];
      setArticles(list);
      setSelectedUrls(new Set(list.map((a) => a.url)));
    } catch {
      setArticles([]);
      setSelectedUrls(new Set());
      setArticlesError("Network error");
    } finally {
      setLoadingArticles(false);
    }
  }, []);

  const toggleUrl = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedUrls(new Set(articles.map((a) => a.url)));
  };

  const selectNone = () => {
    setSelectedUrls(new Set());
  };

  const addSelected = () => {
    const toAdd: SourceEntry[] = [];
    for (const a of articles) {
      if (!selectedUrls.has(a.url)) continue;
      if (existingUrls.has(a.url)) continue;
      toAdd.push({ type: "url", value: a.url });
    }
    if (toAdd.length === 0) {
      setAddFeedback(
        existingUrls.size > 0 && articles.every((a) => existingUrls.has(a.url))
          ? "Those URLs are already in your sources."
          : "Select at least one article (not already added)."
      );
      return;
    }
    onAppendSources(toAdd);
    setAddFeedback(`Added ${toAdd.length} article${toAdd.length === 1 ? "" : "s"} to sources below.`);
  };

  const onChip = (t: string) => {
    setTopic(t);
    void searchArticles(t);
  };

  return (
    <Card className={cn(className)}>
      <CardHeader className="px-5 pt-5 sm:px-6">
        <CardTitle className="text-lg sm:text-base">Search by topic</CardTitle>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-sm">
          Load recent headlines from NewsAPI, preview them, then add URLs to your briefing sources.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-medium text-muted-foreground">Suggested topics</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 self-start sm:self-auto"
            onClick={() => loadSuggestions()}
            disabled={disabled || loadingSuggestions}
          >
            Refresh
          </Button>
        </div>
        {loadingSuggestions && (
          <p className="text-xs text-muted-foreground">Loading suggestions…</p>
        )}
        {suggestionsError && (
          <p className="text-xs text-amber-700 dark:text-amber-500">{suggestionsError}</p>
        )}
        {!loadingSuggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((t) => (
              <button
                key={t}
                type="button"
                disabled={disabled || loadingArticles}
                onClick={() => onChip(t)}
                className="rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-left text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                {t}
              </button>
            ))}
          </div>
        )}
        {!loadingSuggestions && !suggestionsError && suggestions.length === 0 && (
          <p className="text-xs text-muted-foreground">No suggestions right now. Try your own topic below.</p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <Input
            placeholder="e.g. IPL 2025, Iran Israel, climate summit"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !disabled && searchArticles(topic)}
            disabled={disabled || loadingArticles}
            className="sm:flex-1"
          />
          <Button
            type="button"
            onClick={() => searchArticles(topic)}
            disabled={disabled || loadingArticles}
            className="sm:w-40"
          >
            {loadingArticles ? "Searching…" : "Search articles"}
          </Button>
        </div>

        {articlesError && <p className="text-sm text-destructive">{articlesError}</p>}

        {articles.length > 0 && (
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-foreground">Preview</span>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>
                Select all
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={selectNone}>
                Clear
              </Button>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {articles.map((a) => (
                <li key={a.url} className="flex gap-2 rounded-lg border border-transparent bg-background/80 p-2 hover:border-primary/15">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    checked={selectedUrls.has(a.url)}
                    onChange={() => toggleUrl(a.url)}
                    disabled={disabled}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">{a.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{a.source}</p>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs text-primary underline-offset-2 hover:underline"
                    >
                      Open link
                    </a>
                  </div>
                </li>
              ))}
            </ul>
            <Button type="button" onClick={addSelected} disabled={disabled} className="w-full">
              Add selected to sources
            </Button>
            {addFeedback && <p className="text-xs text-muted-foreground">{addFeedback}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
