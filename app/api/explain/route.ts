// app/api/explain/route.ts
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import { spawn } from "child_process";
import OpenAI from "openai";

export const runtime = "nodejs";

type Mode = "quick" | "breakdown" | "example" | "assumptions";
type ReadingLevel = "middle" | "high" | "college" | "expert";

function safeString(x: unknown) {
  return typeof x === "string" ? x : "";
}

function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function findContext(text: string, highlightRaw: string) {
  const highlight = normalize(highlightRaw);
  const textNorm = text;
  const haystack = textNorm.toLowerCase();
  const needle = highlight.toLowerCase();

  const idx = haystack.indexOf(needle);

  // If we can't find the exact highlight, just return the first chunk as "context".
  if (idx === -1) {
    const fallback = textNorm.slice(0, 3500);
    return {
      found: false,
      context: fallback,
    };
  }

  // Grab a window around the match
  const windowChars = 4000;
  const start = Math.max(0, idx - Math.floor(windowChars * 0.45));
  const end = Math.min(textNorm.length, idx + needle.length + Math.floor(windowChars * 0.55));
  const context = textNorm.slice(start, end);

  return {
    found: true,
    context,
  };
}

async function runPdftotext(pdfBuffer: Buffer) {
  // Prefer vendored poppler when deployed on Vercel (or if present locally)
  const vendorBin = path.join(process.cwd(), "vendor", "poppler", "bin", "pdftotext");
  const vendorLib = path.join(process.cwd(), "vendor", "poppler", "lib");

  // If vendor exists, use it; otherwise fall back to PATH (brew poppler locally).
  const useVendor = existsSync(vendorBin);

  const binPath = useVendor ? vendorBin : "pdftotext";

  // Write to temp
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `pdfex-${crypto.randomUUID()}.pdf`);
  const outputPath = path.join(tmpDir, `pdfex-${crypto.randomUUID()}.txt`);

  await fs.writeFile(inputPath, pdfBuffer);

  // Make sure executable bit is set (sometimes tar extraction can lose it)
  if (useVendor) {
    try {
      // @ts-ignore
      const { chmod } = await import("fs/promises");
      await chmod(vendorBin, 0o755);
    } catch {
      // ignore
    }
  }

  const env = {
    ...process.env,
    // Ensure our vendored binaries are discoverable (not strictly required if we spawn by full path)
    PATH: useVendor ? `${path.dirname(vendorBin)}:${process.env.PATH || ""}` : process.env.PATH || "",
    // CRITICAL: let Linux dynamic loader find libpoppler.so.* and friends
    LD_LIBRARY_PATH: useVendor
      ? `${vendorLib}:${process.env.LD_LIBRARY_PATH || ""}`
      : process.env.LD_LIBRARY_PATH || "",
  };

  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(binPath, ["-layout", inputPath, outputPath], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (err) => resolve({ code: -1, stdout: "", stderr: String(err) }));
  });

  if (result.code !== 0) {
    throw new Error(
      `pdftotext failed (code ${result.code}): ${result.stderr || result.stdout || "unknown error"}`
    );
  }

  const text = await fs.readFile(outputPath, "utf8");

  // Cleanup best-effort
  void fs.unlink(inputPath).catch(() => {});
  void fs.unlink(outputPath).catch(() => {});

  return {
    text,
    debug: {
      useVendor,
      binPath: useVendor ? vendorBin : "pdftotext (PATH)",
      vendorLibExists: useVendor ? existsSync(vendorLib) : false,
      libHint: useVendor ? vendorLib : "(system)",
      platform: process.platform,
      arch: process.arch,
    },
  };
}

function buildInstructions(mode: Mode) {
  switch (mode) {
    case "quick":
      return `Explain the highlight in 2–4 sentences, notice any key terms, and connect it to the nearby context.`;
    case "breakdown":
      return `Explain in a structured way:
- Main claim (1 line)
- Key phrases decoded (bullets)
- Reference resolution: what “this/it/they/which” refers to (if present)
- Why it matters in context (1–2 lines)`;
    case "example":
      return `Explain it, then give ONE short example or analogy that matches the context.`;
    case "assumptions":
      return `Explain it and explicitly list assumptions you had to make because context may be missing.`;
    default:
      return `Explain clearly using only the provided context.`;
  }
}

function mapReadingLevel(level: ReadingLevel) {
  switch (level) {
    case "middle":
      return "Write at a middle school reading level. Be simple and clear.";
    case "high":
      return "Write at a high school reading level. Clear, but not childish.";
    case "college":
      return "Write at a college reading level. More precise, but still readable.";
    case "expert":
      return "Write at an expert level. Use precise terminology, concise.";
    default:
      return "Write clearly.";
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const pdf = form.get("pdf");
    const highlight = safeString(form.get("highlight"));
    const mode = (safeString(form.get("mode")) as Mode) || "breakdown";
    const readingLevel = (safeString(form.get("readingLevel")) as ReadingLevel) || "high";

    if (!pdf || !(pdf instanceof File)) {
      return NextResponse.json({ error: "Missing PDF upload." }, { status: 400 });
    }
    if (!highlight.trim()) {
      return NextResponse.json({ error: "Missing highlighted text." }, { status: 400 });
    }

    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());

    const { text, debug } = await runPdftotext(pdfBuffer);

    const { found, context } = findContext(text, highlight);

    const instructions = buildInstructions(mode);
    const level = mapReadingLevel(readingLevel);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Dev-friendly fallback if key isn't set
      return NextResponse.json({
        ok: true,
        output:
          `FAKE AI OUTPUT (no OPENAI_API_KEY set)\n\n` +
          `MODE: ${mode}\nFOUND HIGHLIGHT: ${found}\n\nHIGHLIGHT:\n${highlight}\n\nINSTRUCTIONS:\n${instructions}\n\nCONTEXT:\n${context.slice(0, 3500)}`,
        debug,
      });
    }

    const client = new OpenAI({ apiKey });

    const system = `You are a careful study assistant.
Rules:
- Use ONLY the provided context. If insufficient, say what’s missing.
- Do not hallucinate facts outside the context.
- Keep it helpful and readable.
- ${level}`;

    const user = `HIGHLIGHT:\n${highlight}\n\nMODE INSTRUCTIONS:\n${instructions}\n\nCONTEXT (from PDF near the highlight):\n${context}`;

    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const output = resp.choices?.[0]?.message?.content?.trim() || "No output.";

    return NextResponse.json({
      ok: true,
      output,
      foundHighlight: found,
      debug,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    return NextResponse.json(
      {
        error: "PDF extraction failed",
        details: msg,
      },
      { status: 500 }
    );
  }
}