import { execSync } from "child_process";
import fs from "fs";

const url =
  "https://github.com/bournechoi4353/pdf-explainer/releases/download/poppler-amzn2-v1/poppler-amzn2.tar.gz";

console.log("Downloading Poppler bundle:", url);

execSync(`mkdir -p vendor && curl -L "${url}" -o /tmp/poppler.tgz`, { stdio: "inherit" });
execSync(`tar -xzf /tmp/poppler.tgz -C vendor`, { stdio: "inherit" });

if (!fs.existsSync("vendor/poppler/bin/pdftotext")) {
  throw new Error("Poppler install failed: vendor/poppler/bin/pdftotext not found");
}

execSync(`chmod +x vendor/poppler/bin/pdftotext`, { stdio: "inherit" });
console.log("Poppler installed:", "vendor/poppler/bin/pdftotext");
