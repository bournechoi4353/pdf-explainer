import { execSync } from "child_process";
import fs from "fs";

const url =
  "https://github.com/bournechoi4353/pdf-explainer/releases/download/poppler-bundle-v2/poppler-amzn2.tar.gz";
console.log("Downloading Poppler bundle:", url);

execSync(`mkdir -p vendor && curl -L "${url}" -o /tmp/poppler.tgz`, { stdio: "inherit" });
execSync(`tar -xzf /tmp/poppler.tgz -C vendor`, { stdio: "inherit" });

if (!fs.existsSync("vendor/poppler/bin/pdftotext")) {
  throw new Error("Poppler install failed: vendor/poppler/bin/pdftotext not found");
}

execSync(`chmod +x vendor/poppler/bin/pdftotext`, { stdio: "inherit" });
console.log("Poppler installed:", "vendor/poppler/bin/pdftotext");

// --- FIX FOR VERCEL GLIBC CONFLICT ---
// Remove system glibc libraries bundled accidentally.
// Vercel must use its own glibc.

const badLibs = [
  "libpthread.so.0",
  "libc.so.6",
  "libdl.so.2",
  "librt.so.1",
  "libm.so.6",
  "libgcc_s.so.1",
  "libstdc++.so.6",
  "ld-linux-x86-64.so.2",
  "ld-linux-aarch64.so.1",
];

const libDir = `${process.cwd()}/vendor/poppler/lib`;

for (const lib of badLibs) {
  const libPath = `${libDir}/${lib}`;
  if (fs.existsSync(libPath)) {
    fs.unlinkSync(libPath);
    console.log("Removed bundled system lib:", lib);
  }
}