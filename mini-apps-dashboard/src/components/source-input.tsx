"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SourceEntry = {
  type: "url" | "text";
  value: string;
  /** Multi-section Figma briefing */
  briefing_section?: string;
};

type Props = {
  sources: SourceEntry[];
  onChange: (sources: SourceEntry[]) => void;
  disabled?: boolean;
  className?: string;
};

export function SourceInput({ sources, onChange, disabled, className }: Props) {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");

  const addUrl = () => {
    const v = urlValue.trim();
    if (!v) return;
    onChange([...sources, { type: "url", value: v }]);
    setUrlValue("");
  };

  const addText = () => {
    const v = textValue.trim();
    if (!v) return;
    onChange([...sources, { type: "text", value: v }]);
    setTextValue("");
  };

  const remove = (index: number) => {
    onChange(sources.filter((_, i) => i !== index));
  };

  return (
    <Card className={cn(className)}>
      <CardHeader className="px-5 pt-5 sm:px-6">
        <CardTitle className="text-lg sm:text-base">Sources</CardTitle>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-sm">
          Add article URLs or paste raw text. Multiple sources combine into one briefing.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 px-5 pb-5 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-2">
          <Button
            type="button"
            variant={mode === "url" ? "default" : "outline"}
            size="lg"
            className="w-full sm:h-10 sm:min-h-10 sm:w-auto sm:px-5"
            onClick={() => setMode("url")}
            disabled={disabled}
          >
            URL
          </Button>
          <Button
            type="button"
            variant={mode === "text" ? "default" : "outline"}
            size="lg"
            className="w-full sm:h-10 sm:min-h-10 sm:w-auto sm:px-5"
            onClick={() => setMode("text")}
            disabled={disabled}
          >
            Raw text
          </Button>
        </div>
        {mode === "url" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <Input
              placeholder="https://example.com/article"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addUrl()}
              disabled={disabled}
              className="flex-1"
            />
            <Button
              type="button"
              size="lg"
              onClick={addUrl}
              disabled={disabled || !urlValue.trim()}
              className="w-full shrink-0 sm:w-auto sm:px-8"
            >
              Add
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              placeholder="Paste article or news text here..."
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              rows={5}
              disabled={disabled}
              className="min-h-40 resize-none sm:min-h-32"
            />
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={addText}
              disabled={disabled || !textValue.trim()}
            >
              Add as source
            </Button>
          </div>
        )}
        {sources.length > 0 && (
          <div className="space-y-3">
            <Label className="text-base text-muted-foreground sm:text-sm">
              Added ({sources.length})
            </Label>
            <ul className="space-y-2">
              {sources.map((s, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-3 rounded-2xl border-2 border-border/60 bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 break-all text-base sm:text-sm">
                    {s.type === "url" ? s.value : `${s.value.slice(0, 80)}${s.value.length > 80 ? "…" : ""}`}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full shrink-0 sm:w-auto"
                    onClick={() => remove(i)}
                    disabled={disabled}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
