import { NextResponse } from "next/server";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import { spawn } from "child_process";
import OpenAI from "openai";

export const runtime = "nodejs";

async function extractPdfText(pdfFile: File): Promise<string> {
  const buffer = Buffer.from(await pdfFile.arrayBuffer());

  const tmpDir = os.tmpdir();
  const inputPath = `${tmpDir}/input-${Date.now()}.pdf`;
  const outputPath = `${tmpDir}/output-${Date.now()}.txt`;

  await fs.writeFile(inputPath, buffer);

  const binPath =
    process.platform === "darwin"
      ? "pdftotext"
      : `${process.cwd()}/vendor/poppler/bin/pdftotext`;

  const libPath = `${process.cwd()}/vendor/poppler/lib`;

  if (process.platform !== "darwin" && !fsSync.existsSync(binPath)) {
    throw new Error(`pdftotext not found at ${binPath}`);
  }

  const text = await new Promise<string>((resolve, reject) => {
    const child = spawn(binPath, ["-layout", inputPath, outputPath], {
      env: {
        ...process.env,
        ...(process.platform === "linux" ? { LD_LIBRARY_PATH: libPath } : {}),
      },
    });

    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);

    child.on("close", async (code) => {
      if (code !== 0) {
        return reject(new Error(`pdftotext failed (code ${code}): ${stderr}`));
      }
      const out = await fs.readFile(outputPath, "utf8");
      resolve(out);
    });
  });

  await Promise.allSettled([fs.unlink(inputPath), fs.unlink(outputPath)]);
  return text;
}

/** Normalize for matching: lowercase + collapse whitespace */
function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Find highlight in the PDF text and return a chunk around it.
 * Falls back to start-of-doc if not found.
 */
function getContextChunk(pdfText: string, highlight: string, radius = 2200) {
  const original = pdfText || "";
  const h = highlight || "";

  if (!original.trim()) {
    return {
      context: "",
      found: false,
      start: 0,
      end: 0,
    };
  }

  const origNorm = norm(original);
  const hNorm = norm(h);

  // If highlight is too short, don’t try too hard — just return start.
  if (hNorm.length < 8) {
    const context = original.slice(0, Math.min(original.length, 12000));
    return { context, found: false, start: 0, end: context.length };
  }

  // Find in normalized space
  let idx = origNorm.indexOf(hNorm);

  // Fallback: try shorter highlight (first ~120 chars) if user pasted too much
  if (idx === -1 && hNorm.length > 140) {
    idx = origNorm.indexOf(hNorm.slice(0, 140));
  }

  // If still not found, return start chunk
  if (idx === -1) {
    const context = original.slice(0, Math.min(original.length, 12000));
    return { context, found: false, start: 0, end: context.length };
  }

  // Map normalized index back to original-ish index:
  // We'll approximate by searching the original for a simpler needle:
  // Use a small “needle” from the highlight to locate in original text.
  const needle = h.trim().slice(0, Math.min(h.trim().length, 80));
  let origIdx = needle ? original.toLowerCase().indexOf(needle.toLowerCase()) : -1;

  // If that failed, approximate using ratio
  if (origIdx === -1) {
    const ratio = original.length / Math.max(origNorm.length, 1);
    origIdx = Math.floor(idx * ratio);
  }

  const start = Math.max(0, origIdx - radius);
  const end = Math.min(original.length, origIdx + radius);
  const context = original.slice(start, end);

  return { context, found: true, start, end };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const pdf = form.get("pdf");
    const highlight = String(form.get("highlight") || "").trim();
    const mode = String(form.get("mode") || "breakdown");
    const readingLevel = String(form.get("readingLevel") || "high");

    if (!(pdf instanceof File)) {
      return NextResponse.json({ error: "Missing PDF file" }, { status: 400 });
    }
    if (!highlight) {
      return NextResponse.json({ error: "Missing highlighted text" }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "Missing OPENAI_API_KEY",
          details: "Set it in Vercel env vars (Production) and locally in .env.local",
        },
        { status: 500 }
      );
    }

    const fullText = await extractPdfText(pdf);

    const { context, found } = getContextChunk(fullText, highlight, 2200);

    const modeInstructions: Record<string, string> = {
      quick: "Explain the highlight in 2–4 clear sentences.",
      breakdown: `Return Markdown with these sections:

### Main claim
(1 line)

### Key phrases decoded
- bullets

### Reference resolution
- bullets (only if present)

### Why it matters in context
(1–2 lines)

Use ONLY the provided context. If insufficient, say what's missing.`,
      example: "Explain, then give 2 short examples grounded in the context.",
      assumptions: "Explain and list any assumptions made due to missing context.",
    };

    const levelInstructions: Record<string, string> = {
      middle: "Write for a middle school reader.",
      high: "Write for a high school reader.",
      college: "Write for a college reader.",
      expert: "Write for an expert reader (precise, concise).",
    };

    const prompt = `
MODE: ${mode}
READING LEVEL: ${readingLevel}

HIGHLIGHT:
${highlight}

INSTRUCTIONS:
${modeInstructions[mode] || modeInstructions.breakdown}
${levelInstructions[readingLevel] || levelInstructions.high}

CONTEXT (from PDF):
${context}
`.trim();

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a precise PDF reading assistant. Do not invent facts. Stay grounded in the provided text. Format output as clean Markdown.",
        },
        { role: "user", content: prompt },
      ],
    });

    const output = completion.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({
      ok: true,
      output,
      meta: { highlightFoundInContext: found },
    });
  } catch (err: any) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "PDF extraction failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}