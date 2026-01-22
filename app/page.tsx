"use client";

import { useState } from "react";
import { Upload, FileText, Sparkles, Loader2, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Mode = "quick" | "breakdown" | "example" | "assumptions";
type ReadingLevel = "middle" | "high" | "college" | "expert";

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [highlight, setHighlight] = useState("");
  const [mode, setMode] = useState<Mode>("breakdown");
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>("high");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  const highlightWordCount = highlight.trim().split(/\s+/).filter(Boolean).length;
  const highlightTooShort = highlightWordCount < 3;

  async function handleExplain() {
    if (!file || !highlight.trim()) return;

    setLoading(true);
    setOutput("");

    try {
      const form = new FormData();
      form.append("pdf", file);
      form.append("highlight", highlight);
      form.append("mode", mode);
      form.append("readingLevel", readingLevel);

      const res = await fetch("/api/explain", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        setOutput(`**Error:** ${data?.error || "Unknown error"}`);
      } else {
        setOutput(data.output);
      }
    } catch (e: any) {
      setOutput(`**Request failed:** ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* HERO */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20 p-3">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>

          <h1 className="mb-3 text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="title-accent">PDF Highlight Explainer</span>
          </h1>

          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Upload a PDF, paste what you highlighted, and get an intelligent explanation.
            Best results with{" "}
            <span className="font-semibold text-foreground/90">
              1–2 full sentences
            </span>
            .
          </p>

          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Uses only the provided excerpt. Designed to support understanding —
            not replace thinking.
          </p>
        </div>

        {/* INPUT CARD */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-border/60 bg-card/90 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)] backdrop-blur card-hover">
          <div className="space-y-7 p-6 sm:p-8">
            {/* Upload */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
                <Upload className="h-4 w-4" />
                Upload PDF
              </label>

              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full cursor-pointer rounded-xl border border-input/70 bg-card/70 px-4 py-3 text-sm
                           transition-colors file:mr-4 file:cursor-pointer file:rounded-lg file:border-0
                           file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold
                           file:text-primary-foreground hover:file:bg-primary/90
                           focus:outline-none focus:ring-2 focus:ring-ring/60"
              />

              {file && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/70 px-3 py-2 text-sm text-muted-foreground ring-1 ring-border/50">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium text-foreground/90">
                    {file.name}
                  </span>
                  <span className="text-xs">
                    ({Math.round(file.size / 1024)} KB)
                  </span>
                </div>
              )}
            </div>

            {/* Highlight */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
                <FileText className="h-4 w-4" />
                Highlighted Text
              </label>

              <textarea
                rows={5}
                value={highlight}
                onChange={(e) => setHighlight(e.target.value)}
                placeholder='Example: "Lennie continued to snort into the pool."'
                className="w-full rounded-xl border border-input/70 bg-card/70 px-4 py-3 text-sm
                           placeholder:text-muted-foreground/90 outline-none
                           focus:ring-2 focus:ring-ring/60
                           focus:shadow-[0_0_0_6px_rgba(59,130,246,0.10)]"
              />

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{highlightWordCount} words</span>
                {highlightTooShort && highlight.trim() && (
                  <div className="flex items-center gap-1.5 text-amber-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Try at least 3+ words</span>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <label className="text-sm font-semibold">Explanation Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  className="w-full rounded-xl border border-input/70 bg-card/70 px-4 py-3 text-sm
                             focus:outline-none focus:ring-2 focus:ring-ring/60"
                >
                  <option value="quick">Quick</option>
                  <option value="breakdown">Breakdown</option>
                  <option value="example">Example</option>
                  <option value="assumptions">Assumptions</option>
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-semibold">Reading Level</label>
                <select
                  value={readingLevel}
                  onChange={(e) =>
                    setReadingLevel(e.target.value as ReadingLevel)
                  }
                  className="w-full rounded-xl border border-input/70 bg-card/70 px-4 py-3 text-sm
                             focus:outline-none focus:ring-2 focus:ring-ring/60"
                >
                  <option value="middle">Middle School</option>
                  <option value="high">High School</option>
                  <option value="college">College</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={handleExplain}
              disabled={!file || !highlight.trim() || loading}
              className="group relative w-full rounded-xl bg-primary px-6 py-4 text-sm font-semibold
                         text-primary-foreground shadow-[0_14px_34px_-20px_rgba(59,130,246,0.75)]
                         transition-all hover:bg-primary/90 hover:-translate-y-[1px]
                         focus:outline-none focus:ring-2 focus:ring-ring/70
                         disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Explain
                </span>
              )}
            </button>
          </div>
        </div>

        {/* OUTPUT */}
        {(output || loading) && (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/90 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)] backdrop-blur card-hover">
            <div className="border-b border-border/60 bg-muted/40 px-6 py-4">
              <h2 className="text-sm font-semibold">Explanation</h2>
            </div>

            <div className="p-6">
              <div className="prose prose-invert max-w-none prose-p:leading-7 prose-li:leading-7">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {output || "Generating explanation..."}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        <div className="mt-10 text-center text-xs text-muted-foreground">
          Built for reading comprehension and accessibility — not for replacing
          learning.
        </div>
      </main>
    </div>
  );
}