import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { spawn } from "child_process";

export const runtime = "nodejs";

/**
 * Extract text from a PDF using Poppler (pdftotext)
 */
async function extractPdfText(pdfFile: File): Promise<string> {
  if (!pdfFile || pdfFile.size === 0) {
    throw new Error("PDF file is missing or empty");
  }

  // Convert uploaded PDF to Buffer
  const buffer = Buffer.from(await pdfFile.arrayBuffer());

  // Temp file paths (serverless-safe)
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `input-${Date.now()}.pdf`);
  const outputPath = path.join(tmpDir, `output-${Date.now()}.txt`);

  await fs.writeFile(inputPath, buffer);

  // 🔴 THIS IS THE CRITICAL PART YOU ASKED FOR
  const binPath = path.join(
    process.cwd(),
    "vendor",
    "poppler",
    "bin",
    "pdftotext"
  );

  const libPath = path.join(
    process.cwd(),
    "vendor",
    "poppler",
    "lib"
  );

  const text = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      binPath,
      ["-layout", inputPath, outputPath],
      {
        env: {
          ...process.env,
          LD_LIBRARY_PATH: libPath
        }
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
      } catch (err) {
        reject(err);
      }
    });
  });

  // Cleanup (best-effort)
  await Promise.allSettled([
    fs.unlink(inputPath),
    fs.unlink(outputPath)
  ]);

  if (!text || text.length < 20) {
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

    const contextText = await extractPdfText(pdf);

    // For now: return debug output (you can plug OpenAI here)
    return NextResponse.json({
      ok: true,
      mode,
      readingLevel,
      highlight,
      contextPreview: contextText.slice(0, 500)
    });

  } catch (err: any) {
    console.error("PDF extraction error:", err);

    return NextResponse.json(
      {
        error: "PDF extraction failed",
        details: err?.message || String(err)
      },
      { status: 500 }
    );
  }
}