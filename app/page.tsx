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

      const raw = await res.text();
      let data: any;

      try {
        data = JSON.parse(raw);
      } catch {
        setOutput("Server returned non-JSON output:\n\n" + raw);
        return;
      }

      console.log("API response:", data);

      if (!res.ok) {
        setOutput(
          `Error: ${data?.error || "Unknown error"}\n\n${
            data?.details || ""
          }`
        );
      } else {
        setOutput(data.output || "No explanation returned.");
      }
    } catch (e: any) {
      setOutput("Request failed: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-4xl px-4 py-12">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center justify-center rounded-full bg-primary/15 p-3">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mb-3 text-4xl font-bold text-foreground">
            PDF Highlight Explainer
          </h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Upload a PDF, paste what you highlighted, and get a clear,
            context-aware explanation.
          </p>
        </div>

        {/* Input Card */}
        <div className="mb-8 rounded-xl border border-border bg-card shadow-lg">
          <div className="space-y-6 p-6">
            {/* Upload */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <Upload className="h-4 w-4" />
                Upload PDF
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full rounded-lg border border-input bg-card px-4 py-3 text-sm"
              />
              {file && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  {file.name}
                </div>
              )}
            </div>

            {/* Highlight */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Highlighted Text</label>
              <textarea
                rows={5}
                value={highlight}
                onChange={(e) => setHighlight(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm"
                placeholder='Example: "Lennie continued to snort into the pool."'
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{highlightWordCount} words</span>
                {highlightTooShort && highlight && (
                  <span className="flex items-center gap-1 text-amber-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Try 3+ words
                  </span>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold">Explanation Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  <option value="quick">Quick</option>
                  <option value="breakdown">Breakdown</option>
                  <option value="example">Example</option>
                  <option value="assumptions">Assumptions</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold">Reading Level</label>
                <select
                  value={readingLevel}
                  onChange={(e) =>
                    setReadingLevel(e.target.value as ReadingLevel)
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  <option value="middle">Middle School</option>
                  <option value="high">High School</option>
                  <option value="college">College</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
            </div>

            {/* Button */}
            <button
              onClick={handleExplain}
              disabled={!file || !highlight || loading}
              className="w-full rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing…
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

            {output && (
              <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                <div className="border-b border-border bg-muted/40 px-6 py-4">
                  <h2 className="text-sm font-semibold text-card-foreground">Explanation</h2>
                </div>
                <div className="p-6">
                  <div className="prose prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-li:my-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {output}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
      </main>
    </div>
  );
}