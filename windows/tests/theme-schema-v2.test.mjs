import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "codex-newskin-schema-v2-"));
const valid = {
  schemaVersion: 2,
  id: "custom-schema-v2",
  name: "Schema v2",
  image: "background.jpg",
  home: {
    banner: "banner.jpg",
    title: "Only on an empty home",
    subtitle: "A controlled IP layer",
    suggestions: [
      { title: "Plan", prompt: "Plan this work." },
      { title: "Review", prompt: "Review this code." },
      { title: "Build", prompt: "Build this feature." },
      { title: "Test", prompt: "Test this change." },
    ],
  },
};

try {
  await fs.copyFile(path.join(root, "assets", "newskin-reference.jpg"), path.join(temporary, "background.jpg"));
  await fs.copyFile(path.join(root, "assets", "newskin-reference.jpg"), path.join(temporary, "banner.jpg"));
  await fs.writeFile(path.join(temporary, "theme.json"), `${JSON.stringify(valid)}\n`);
  const output = execFileSync(process.execPath, [
    path.join(root, "scripts", "injector.mjs"), "--check-payload", "--theme-dir", temporary,
  ], { encoding: "utf8" });
  assert.equal(JSON.parse(output).pass, true, "A v2 IP theme should build a safe payload.");
  const preview = path.join(temporary, "draft-preview.html");
  const previewOutput = execFileSync(process.execPath, [
    path.join(root, "scripts", "preview-ip-theme.mjs"), "--theme-dir", temporary, "--output", preview,
  ], { encoding: "utf8" });
  assert.match(previewOutput, /Codex was not contacted or modified/,
    "A draft preview must explicitly remain outside the Codex runtime.");
  const previewHtml = await fs.readFile(preview, "utf8");
  assert.match(previewHtml, /object-fit:contain/, "The standalone preview must preserve IP art aspect ratio.");
  assert.equal((previewHtml.match(/class="cards"/g) || []).length, 1,
    "A draft preview must render its controlled four-card area.");

  await fs.writeFile(path.join(temporary, "background.mp4"), Buffer.from("video-fixture"));
  await fs.writeFile(path.join(temporary, "theme.json"), `${JSON.stringify({
    schemaVersion: 2, id: "video-schema-v2", name: "Video", image: "background.mp4", mediaType: "video",
  })}\n`);
  const videoOutput = execFileSync(process.execPath, [
    path.join(root, "scripts", "injector.mjs"), "--check-payload", "--theme-dir", temporary,
  ], { encoding: "utf8" });
  assert.equal(JSON.parse(videoOutput).pass, true, "A bounded local video theme should build a safe payload.");

const invalid = { ...valid, home: { ...valid.home, suggestions: valid.home.suggestions.slice(0, 3) } };
  await fs.writeFile(path.join(temporary, "theme.json"), `${JSON.stringify(invalid)}\n`);
  assert.throws(() => execFileSync(process.execPath, [
    path.join(root, "scripts", "injector.mjs"), "--check-payload", "--theme-dir", temporary,
  ], { encoding: "utf8", stdio: "pipe" }), /home\.suggestions/);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

console.log("PASS: schema v2 accepts an exactly-four-card IP home layer and rejects any other count.");
