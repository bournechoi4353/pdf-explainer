"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  FileText,
  Sparkles,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  History,
  Settings2,
  PanelLeft,
  ChevronRight,
} from "lucide-react";

type Mode = "quick" | "breakdown" | "example" | "assumptions";
type ReadingLevel = "middle" | "high" | "college" | "expert";

type ChatMessage =
  | {
      role: "user";
      id: string;
      createdAt: number;
      fileName: string;
      highlight: string;
      mode: Mode;
      readingLevel: ReadingLevel;
    }
  | {
      role: "assistant";
      id: string;
      createdAt: number;
      output: string;
    };

type Thread = {
  id: string;
  createdAt: number;
  title: string;
  fileName?: string;
  messages: ChatMessage[];
};

const STORAGE_KEY = "pdf-explain-threads-v5";
const MAX_THREADS = 30;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString();
}

function makeTitle(fileName?: string, highlight?: string) {
  const base = fileName ? fileName.replace(/\.pdf$/i, "") : "New thread";
  const h = (highlight || "").trim();
  if (!h) return base;
  const short = h.length > 40 ? h.slice(0, 40) + "…" : h;
  return `${base} — ${short}`;
}

function computeWideLevel(messages: ChatMessage[]) {
  const total = messages
    .filter((m) => m.role === "assistant")
    .reduce((acc, m) => acc + ((m as any).output?.length || 0), 0);

  if (total < 900) return 0;
  if (total < 2400) return 1;
  return 2;
}

function bubbleMaxWidth(textLen: number) {
  if (textLen < 220) return "max-w-[600px]";
  if (textLen < 900) return "max-w-[780px]";
  if (textLen < 2000) return "max-w-[920px]";
  return "max-w-[1100px]";
}

function humanKB(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`;
}

export default function Page() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  const [file, setFile] = useState<File | null>(null);
  const [highlight, setHighlight] = useState("");
  const [mode, setMode] = useState<Mode>("breakdown");
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>("high");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Thread[];
        setThreads(parsed);
        if (parsed.length > 0) setActiveId(parsed[0].id);
      } else {
        const t = createNewThread();
        setThreads([t]);
        setActiveId(t.id);
      }
    } catch {
      const t = createNewThread();
      setThreads([t]);
      setActiveId(t.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(threads.slice(0, MAX_THREADS))
      );
    } catch {}
  }, [threads]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) || null,
    [threads, activeId]
  );

  const wideLevel = useMemo(() => {
    if (!activeThread) return 0;
    return computeWideLevel(activeThread.messages);
  }, [activeThread]);

  const containerMaxW = useMemo(() => {
    if (wideLevel === 0) return "max-w-[980px]";
    if (wideLevel === 1) return "max-w-[1120px]";
    return "max-w-[1320px]";
  }, [wideLevel]);

  const highlightWordCount = useMemo(
    () => highlight.trim().split(/\s+/).filter(Boolean).length,
    [highlight]
  );
  const highlightTooShort = highlight.trim() !== "" && highlightWordCount < 3;

  function createNewThread(): Thread {
    return {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      title: "New thread",
      messages: [],
    };
  }

  function newThread() {
    const t = createNewThread();
    setThreads((prev) => [t, ...prev].slice(0, MAX_THREADS));
    setActiveId(t.id);
    setFile(null);
    setHighlight("");
    setLoading(false);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
  }

  function deleteThread(id: string) {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeId === id) {
      const next = threads.find((t) => t.id !== id);
      if (next) setActiveId(next.id);
      else {
        const t = createNewThread();
        setThreads([t]);
        setActiveId(t.id);
      }
    }
  }

  function clearAll() {
    const t = createNewThread();
    setThreads([t]);
    setActiveId(t.id);
    setFile(null);
    setHighlight("");
    setLoading(false);
  }

  function pushMessageToActive(msg: ChatMessage) {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== activeId) return t;
        const updated = { ...t, messages: [...t.messages, msg] };
        if (msg.role === "user") {
          updated.fileName = msg.fileName;
          updated.title = makeTitle(msg.fileName, msg.highlight);
        }
        return updated;
      })
    );
  }

  function replaceAssistantMessage(assistantId: string, out: string) {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== activeId) return t;
        return {
          ...t,
          messages: t.messages.map((m) =>
            m.role === "assistant" && m.id === assistantId
              ? { ...m, output: out }
              : m
          ),
        };
      })
    );
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [activeThread?.messages.length]);

  async function handleExplain() {
    if (!file || !highlight.trim() || !activeThread) return;

    setLoading(true);

    const userMsg: ChatMessage = {
      role: "user",
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      fileName: file.name,
      highlight: highlight.trim(),
      mode,
      readingLevel,
    };
    pushMessageToActive(userMsg);

    const assistantId = crypto.randomUUID();
    pushMessageToActive({
      role: "assistant",
      id: assistantId,
      createdAt: Date.now(),
      output: "Generating explanation…",
    });

    try {
      const form = new FormData();
      form.append("pdf", file);
      form.append("highlight", highlight);
      form.append("mode", mode);
      form.append("readingLevel", readingLevel);

      const res = await fetch("/api/explain", { method: "POST", body: form });
      const raw = await res.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("Server returned non-JSON:\n\n" + raw);
      }

      const out = res.ok
        ? data.output || "No explanation returned."
        : `Error: ${data?.error || "Unknown error"}\n\n${data?.details || ""}`;

      replaceAssistantMessage(assistantId, out);
      setHighlight("");
    } catch (e: any) {
      replaceAssistantMessage(
        assistantId,
        "Request failed: " + (e?.message || String(e))
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen bg-background text-foreground relative overflow-hidden">
      {/* Background layers (requires your globals.css to define these classes) */}
      <div className="pointer-events-none absolute inset-0 bg-mesh" />
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-30" />
      <div className="pointer-events-none absolute -top-24 right-[-120px] h-[320px] w-[320px] rounded-full bg-glow blur-3xl opacity-60" />
      <div className="pointer-events-none absolute -bottom-28 left-[-140px] h-[420px] w-[420px] rounded-full bg-glow2 blur-3xl opacity-50" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_0%,rgba(255,255,255,0.06),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_600px_at_50%_100%,rgba(0,0,0,0.55),transparent_55%)]" />

      <div className="relative flex h-full">
        {/* Sidebar */}
        <aside
          className={cx(
            "hidden md:flex flex-col border-r border-border/70",
            "bg-card/50 backdrop-blur-xl",
            "transition-all duration-300",
            sidebarOpen ? "w-[300px]" : "w-[72px]"
          )}
        >
          <div className="p-4">
            <div
              className={cx("flex items-center gap-2", !sidebarOpen && "justify-center")}
            >
              <div className="rounded-xl bg-primary/15 p-2">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              {sidebarOpen && (
                <div>
                  <div className="text-sm font-semibold">PDF Explainer</div>
                  <div className="text-[11px] text-muted-foreground">context chat</div>
                </div>
              )}
            </div>

            <button
              onClick={newThread}
              className={cx(
                "mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground",
                "bg-[linear-gradient(135deg,hsla(252,92%,72%,0.95),hsla(190,95%,60%,0.55))]",
                "hover:opacity-95",
                !sidebarOpen && "px-0"
              )}
              title="New thread"
            >
              <span
                className={cx("inline-flex items-center gap-2", !sidebarOpen && "justify-center")}
              >
                <Plus className="h-4 w-4" />
                {sidebarOpen && "New"}
              </span>
            </button>

            <div
              className={cx("mt-4 flex items-center justify-between", !sidebarOpen && "justify-center")}
            >
              {sidebarOpen ? (
                <>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <History className="h-4 w-4" />
                    Threads
                  </div>
                  <button
                    onClick={clearAll}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    title="Clear all"
                  >
                    Clear
                  </button>
                </>
              ) : (
                <button
                  onClick={clearAll}
                  className="rounded-lg border border-border/70 bg-card/60 p-2 text-muted-foreground hover:bg-muted/20"
                  title="Clear all"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto px-2 pb-4">
            {threads.map((t) => {
              const active = t.id === activeId;
              return (
                <div key={t.id} className="group relative">
                  <button
                    onClick={() => setActiveId(t.id)}
                    className={cx(
                      "w-full rounded-xl px-3 py-3 text-left transition",
                      active ? "bg-muted/30" : "hover:bg-muted/20",
                      sidebarOpen && active && "shadow-[0_0_0_1px_rgba(167,139,250,0.25)]",
                      !sidebarOpen && "px-2"
                    )}
                    title={t.title}
                  >
                    {sidebarOpen ? (
                      <>
                        <div className="truncate text-sm font-semibold">{t.title}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {formatTime(t.createdAt)}
                        </div>
                      </>
                    ) : (
                      <div className="h-10 w-10 rounded-xl border border-border/70 bg-muted/10 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </button>

                  {sidebarOpen && (
                    <button
                      onClick={() => deleteThread(t.id)}
                      className="absolute right-3 top-3 hidden rounded-md p-1 text-muted-foreground hover:bg-muted group-hover:block"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className={cx("border-t border-border/70 p-3", !sidebarOpen && "flex justify-center")}>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/20"
              title="Toggle sidebar"
            >
              <PanelLeft className="h-4 w-4" />
              {sidebarOpen && "Collapse"}
            </button>
          </div>
        </aside>

        {/* Main */}
        <section className="flex flex-1 flex-col">
          {/* Top bar */}
          <div className="border-b border-border/70 bg-background/55 backdrop-blur-xl">
            <div className={cx("mx-auto px-4 py-4 transition-all duration-300", containerMaxW)}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-base font-semibold">Explain with context</div>
                  <div className="text-xs text-muted-foreground">
                    Paste a highlight → get a grounded explanation from nearby PDF context.
                  </div>
                </div>

                <div className="shrink-0">
                  {/* Wider settings pill */}
                  <div className="inline-flex items-center gap-3 rounded-2xl border border-border/70 bg-card/45 px-4 py-2.5 min-w-[340px] justify-between">
                    <div className="inline-flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                      <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value as Mode)}
                        className="bg-transparent text-sm focus:outline-none min-w-[140px]"
                      >
                        <option value="quick">Quick</option>
                        <option value="breakdown">Breakdown</option>
                        <option value="example">Example</option>
                        <option value="assumptions">Assumptions</option>
                      </select>
                    </div>

                    <span className="text-muted-foreground">•</span>

                    <select
                      value={readingLevel}
                      onChange={(e) => setReadingLevel(e.target.value as ReadingLevel)}
                      className="bg-transparent text-sm focus:outline-none min-w-[140px]"
                    >
                      <option value="middle">Middle School</option>
                      <option value="high">High School</option>
                      <option value="college">College</option>
                      <option value="expert">Expert</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chat */}
          <div ref={scrollRef} className="flex-1 overflow-auto">
            <div className={cx("mx-auto px-4 py-8 space-y-6 transition-all duration-300", containerMaxW)}>
              {!activeThread || activeThread.messages.length === 0 ? (
                <div className="mx-auto max-w-[760px]">
                  <div className="rounded-[26px] p-[1px] bg-[linear-gradient(135deg,rgba(167,139,250,0.35),rgba(34,211,238,0.18),rgba(255,255,255,0.08))] shadow-xl">
                    <div className="rounded-[25px] border border-border/70 bg-card/45 backdrop-blur-xl p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold">Start a thread</div>
                          <div className="mt-2 text-sm text-muted-foreground space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted/30 text-[11px] font-semibold">
                                1
                              </span>
                              Upload a PDF
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted/30 text-[11px] font-semibold">
                                2
                              </span>
                              Paste your highlight (1–2 sentences works best)
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted/30 text-[11px] font-semibold">
                                3
                              </span>
                              Click Explain
                            </div>
                          </div>
                        </div>

                        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border/70 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                          <span className="inline-flex h-2 w-2 rounded-full bg-[rgba(167,139,250,0.8)]" />
                          Context-aware
                          <ChevronRight className="h-4 w-4 opacity-70" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                activeThread.messages.map((m) => {
                  if (m.role === "user") {
                    return (
                      <div key={m.id} className="flex justify-end">
                        <div className="w-full max-w-[860px]">
                          <div className="rounded-[26px] border border-border/70 bg-user/35 backdrop-blur-xl shadow-xl overflow-hidden">
                            <div className="px-6 py-5 space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs text-muted-foreground">
                                  You • {formatTime(m.createdAt)}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {m.mode} • {m.readingLevel}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <FileText className="h-4 w-4" />
                                <span className="truncate">{m.fileName}</span>
                              </div>

                              <div className="text-sm whitespace-pre-wrap">{m.highlight}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const len = (m.output || "").length;

                  return (
                    <div key={m.id} className="flex justify-start">
                      <div className={cx("w-full", bubbleMaxWidth(len))}>
                        <div className="rounded-[26px] p-[1px] bg-[radial-gradient(120%_120%_at_10%_10%,rgba(255,255,255,0.10),transparent_50%),radial-gradient(120%_120%_at_90%_20%,rgba(167,139,250,0.38),transparent_55%),radial-gradient(120%_120%_at_30%_90%,rgba(34,211,238,0.22),transparent_55%)] shadow-xl">
                          <div className="rounded-[25px] border border-border/70 bg-card/45 backdrop-blur-xl">
                            <div className="px-6 py-5 space-y-2">
                              <div className="text-xs text-muted-foreground">
                                Explainer • {formatTime(m.createdAt)}
                              </div>
                              <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                                {m.output}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Composer */}
          <div className="border-t border-border/70 bg-background/55 backdrop-blur-xl">
            <div className={cx("mx-auto px-4 py-5 transition-all duration-300", containerMaxW)}>
              <div className="rounded-[28px] p-[1px] bg-[linear-gradient(135deg,rgba(167,139,250,0.25),rgba(34,211,238,0.12),rgba(255,255,255,0.06))] shadow-2xl">
                <div className="rounded-[27px] border border-border/70 bg-card/45 backdrop-blur-xl p-5">
                  <div className="grid gap-4 lg:grid-cols-[380px_1fr_190px] items-stretch">
                    {/* PDF */}
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <Upload className="h-4 w-4" />
                        PDF
                      </label>

                      <input
                        id="pdf-input"
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />

                      <div className="flex-1">
                        <div className="h-[56px] w-full rounded-2xl border border-input bg-card/45 px-3 flex items-center gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                          <label
                            htmlFor="pdf-input"
                            className={cx(
                              "h-[42px] shrink-0 rounded-xl px-4 inline-flex items-center justify-center",
                              "text-sm font-semibold cursor-pointer select-none",
                              "bg-[linear-gradient(135deg,hsla(252,92%,72%,0.95),hsla(190,95%,60%,0.55))]",
                              "text-primary-foreground hover:opacity-95"
                            )}
                          >
                            Choose PDF
                          </label>

                          <div className="min-w-0 flex-1">
                            {file ? (
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                  <span className="truncate text-sm text-card-foreground">
                                    {file.name}
                                  </span>
                                </div>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {humanKB(file.size)}
                                </span>
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground/80 truncate">
                                No file selected
                              </div>
                            )}
                          </div>

                          {file && (
                            <button
                              type="button"
                              onClick={() => setFile(null)}
                              className="h-[42px] shrink-0 rounded-xl px-3 inline-flex items-center justify-center
                                         border border-border/70 bg-muted/10 text-muted-foreground hover:bg-muted/20"
                              title="Remove file"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <div className="mt-2 min-h-[18px] text-[11px] text-muted-foreground flex items-center gap-2">
                          {file ? (
                            <span className="opacity-80">Ready to explain.</span>
                          ) : (
                            <span className="opacity-70">Choose a PDF to enable Explain.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Highlight */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Highlight
                        </label>
                        <span className="text-[11px] text-muted-foreground">{highlightWordCount} words</span>
                      </div>

                      <div className="flex-1 rounded-2xl border border-input bg-card/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden">
                        <textarea
                          value={highlight}
                          onChange={(e) => setHighlight(e.target.value)}
                          className="h-[56px] w-full resize-none bg-transparent px-4 py-4 text-sm
                                     placeholder:text-muted-foreground focus:outline-none"
                          placeholder="Paste highlighted text…"
                        />
                      </div>

                      <div className="mt-2 min-h-[20px]">
                        {highlightTooShort && (
                          <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            <AlertCircle className="h-4 w-4" />
                            Try 3+ words for better matching.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Explain */}
                    <div className="flex flex-col">
                      <div className="mb-2 text-xs font-semibold text-muted-foreground opacity-0 select-none">
                        Explain
                      </div>

                      <button
                        onClick={handleExplain}
                        disabled={!file || !highlight.trim() || loading}
                        className={cx(
                          "h-[56px] w-full rounded-2xl px-5 text-sm font-semibold text-primary-foreground",
                          "shadow-[0_10px_30px_rgba(167,139,250,0.12)] transition",
                          "bg-[linear-gradient(135deg,hsla(252,92%,72%,0.95),hsla(190,95%,60%,0.50))]",
                          "hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-ring",
                          "disabled:cursor-not-allowed disabled:opacity-50"
                        )}
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Explaining…
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            Explain
                          </span>
                        )}
                      </button>

                      <div className="mt-2 min-h-[18px] text-[11px] text-muted-foreground opacity-80">
                        {wideLevel === 0 ? "Compact view" : wideLevel === 1 ? "Reading view" : "Wide view"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="opacity-80">
                      Workspace expands as threads grow • tuned for long study explanations.
                    </span>
                    <span className="opacity-80">Tip: highlight 1–2 sentences for best matching.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}