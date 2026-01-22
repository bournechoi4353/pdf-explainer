import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import OpenAI from "openai";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

function normalize(s: string) {
  return s
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim();
}

function findContext(fullTextRaw: string, highlightRaw: string) {
  const text = normalize(fullTextRaw);
  const highlight = normalize(highlightRaw);

  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) {
    return { found: false, context: text.slice(0, 1800) };
  }

  const start = Math.max(0, idx - 1200);
  const end = Math.min(text.length, idx + highlight.length + 1200);
  return { found: true, context: text.slice(start, end) };
}

function buildModeInstructions(mode: string) {
  switch (mode) {
    case "quick":
      return "Explain in 2–4 sentences. Prioritize clarity. Do NOT summarize the whole document.";
    case "example":
      return "Explain clearly, then give ONE concrete example/analogy. Keep it concise.";
    case "assumptions":
      return "Explain, then list 2–4 implied assumptions/background facts the author expects the reader to know.";
    case "breakdown":
    default:
      return `Explain in a structured way:
- Main claim (1 line)
- Key phrases decoded (bullets)
- Reference resolution: what “this/it/they/which” refers to (if present)
- Why it matters in context (1–2 lines)

RULES:
- Use ONLY the provided CONTEXT.
- If the CONTEXT is insufficient, say exactly what is missing.
- Do NOT invent quotes or details not present in the context.`;
  }
}

function buildReadingLevelInstructions(level: string) {
  switch (level) {
    case "middle":
      return "Write for a middle-school reader: short sentences, simple words, define any hard term.";
    case "high":
      return "Write for a high-school student: clear, slightly academic, define key terms briefly.";
    case "college":
      return "Write for a college student: more precise language, connect ideas, but stay readable.";
    case "expert":
      return "Write for an expert: concise, technical, assume background knowledge, avoid over-explaining.";
    default:
      return "Write for a high-school student: clear, slightly academic, define key terms briefly.";
  }
}

async function pdfToTextWithPoppler(pdfBytes: Buffer): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-explain-"));
  const id = crypto.randomBytes(8).toString("hex");
  const pdfPath = path.join(tmpDir, `${id}.pdf`);
  const txtPath = path.join(tmpDir, `${id}.txt`);

  try {
    await fs.writeFile(pdfPath, pdfBytes);

    // -enc UTF-8 keeps output consistent
    // -nopgbrk avoids page break markers
    await execFileAsync("pdftotext", ["-enc", "UTF-8", "-nopgbrk", pdfPath, txtPath], {
      timeout: 20000,
    });

    return await fs.readFile(txtPath, "utf8");
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const pdf = form.get("pdf");
    const highlight = String(form.get("highlight") || "").trim();
    const mode = String(form.get("mode") || "breakdown").trim() || "breakdown";
    const readingLevel = String(form.get("readingLevel") || "high").trim() || "high";

    if (!pdf || !(pdf instanceof File)) {
      return NextResponse.json({ error: "Missing PDF file" }, { status: 400 });
    }
    if (!highlight) {
      return NextResponse.json({ error: "Missing highlighted text" }, { status: 400 });
    }
    if (pdf.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF too large (max 20MB)" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Missing OPENAI_API_KEY. Put it in .env.local in the project root (no quotes), then restart dev server.",
        },
        { status: 500 }
      );
    }

    // PDF -> text
    const bytes = Buffer.from(await pdf.arrayBuffer());
    let fullText = "";
    try {
      fullText = await pdfToTextWithPoppler(bytes);
    } catch (e: any) {
      return NextResponse.json(
        { error: `PDF extraction failed. Install Poppler: brew install poppler. Details: ${e?.message || e}` },
        { status: 500 }
      );
    }

    if (fullText.trim().length < 30) {
      return NextResponse.json(
        {
          error:
            "No readable text extracted. This PDF may be scanned images (no embedded text). Try a text-based PDF.",
        },
        { status: 400 }
      );
    }

    const { found, context } = findContext(fullText, highlight);
    const modeInstructions = buildModeInstructions(mode);
    const levelInstructions = buildReadingLevelInstructions(readingLevel);

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const input = `
You are an accessibility-focused reading assistant.

READING LEVEL:
${levelInstructions}

MODE INSTRUCTIONS:
${modeInstructions}

HIGHLIGHT (what the user selected):
${highlight}

CONTEXT (from the PDF):
${context}
`.trim();

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input,
    });

    const output = resp.output_text || "No output returned.";

    return NextResponse.json({ output, found, readingLevel });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown server error" }, { status: 500 });
  }
}