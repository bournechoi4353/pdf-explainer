import { NextResponse } from "next/server";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import OpenAI from "openai";

export const runtime = "nodejs";

/**
 * Extract text from a PDF using Poppler (pdftotext)
 */
async function extractPdfText(pdfFile: File): Promise<string> {
  if (!pdfFile || pdfFile.size === 0) {
    throw new Error("PDF file is missing or empty");
  }

  const buffer = Buffer.from(await pdfFile.arrayBuffer());

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `input-${Date.now()}.pdf`);
  const outputPath = path.join(tmpDir, `output-${Date.now()}.txt`);

  await fs.writeFile(inputPath, buffer);

  // macOS local dev → Homebrew pdftotext
  // Linux (Vercel) → bundled Poppler binary
  const binPath =
    process.platform === "darwin"
      ? "pdftotext"
      : path.join(process.cwd(), "vendor", "poppler", "bin", "pdftotext");

  const libPath = path.join(process.cwd(), "vendor", "poppler", "lib");

  // Safety checks
  if (process.platform !== "darwin" && !fsSync.existsSync(binPath)) {
    throw new Error(`pdftotext not found at ${binPath}`);
  }

  const text = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      binPath,
      ["-layout", inputPath, outputPath],
      {
        env: {
          ...process.env,
          ...(process.platform === "linux"
            ? { LD_LIBRARY_PATH: libPath }
            : {}),
        },
      }
    );

    let stderr = "";

    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", reject);

    child.on("close", async (code) => {
      if (code !== 0) {
        return reject(
          new Error(`pdftotext failed (code ${code}): ${stderr}`)
        );
      }

      try {
        const out = await fs.readFile(outputPath, "utf8");
        resolve(out.trim());
      } catch (e) {
        reject(e);
      }
    });
  });

  await Promise.allSettled([
    fs.unlink(inputPath),
    fs.unlink(outputPath),
  ]);

  if (!text || text.length < 30) {
    throw new Error("No readable text extracted from PDF");
  }

  return text;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const pdf = form.get("pdf");
    const highlight = String(form.get("highlight") || "").trim();
    const mode = String(form.get("mode") || "breakdown");
    const readingLevel = String(form.get("readingLevel") || "high");

    if (!(pdf instanceof File)) {
      return NextResponse.json(
        { error: "Missing PDF file" },
        { status: 400 }
      );
    }

    if (!highlight) {
      return NextResponse.json(
        { error: "Missing highlighted text" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "Missing OPENAI_API_KEY",
          details:
            "Set it in .env.local (local) or Vercel Environment Variables",
        },
        { status: 500 }
      );
    }

    // 1️⃣ Extract PDF text
    const fullText = await extractPdfText(pdf);

    // Keep context bounded (cheap + fast)
    const context = fullText.slice(0, 12000);

    // 2️⃣ Build AI prompt
    const modeInstructions: Record<string, string> = {
      quick: "Explain the highlight in 2–4 clear sentences.",
      breakdown: `Explain in a structured way:
- Main claim (1 line)
- Key phrases decoded (bullets)
- Reference resolution: what “this/it/they/which” refers to (if present)
- Why it matters in context (1–2 lines)
Use ONLY the provided context. If insufficient, say what’s missing.`,
      example:
        "Explain the highlight, then give 2 short examples or analogies grounded in the context.",
      assumptions:
        "Explain the highlight and list any assumptions made due to missing context.",
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

    // 3️⃣ Call OpenAI
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a precise PDF reading assistant. Do not invent facts. Stay grounded in the provided text.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const output =
      completion.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({
      ok: true,
      output,
    });
  } catch (err: any) {
    console.error("PDF extraction error:", err);

    return NextResponse.json(
      {
        error: "PDF extraction failed",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}