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
  image: "background.png",
  home: {
    banner: "banner.png",
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
  await fs.copyFile(path.join(root, "assets", "portal-hero.png"), path.join(temporary, "background.png"));
  await fs.copyFile(path.join(root, "assets", "portal-hero.png"), path.join(temporary, "banner.png"));
  await fs.writeFile(path.join(temporary, "theme.json"), `${JSON.stringify(valid)}\n`);
  const output = execFileSync(process.execPath, [
    path.join(root, "scripts", "injector.mjs"), "--check-payload", "--theme-dir", temporary,
  ], { encoding: "utf8" });
  assert.equal(JSON.parse(output).pass, true, "A v2 IP theme should build a safe payload.");
  const stage = path.join(temporary, "stage");
  await fs.mkdir(stage);
  execFileSync(process.execPath, [path.join(root, "scripts", "stage-theme.mjs"), temporary, stage], { encoding: "utf8" });
  assert.equal((await fs.stat(path.join(stage, "banner.png"))).isFile(), true,
    "Staging must retain the separately referenced banner asset.");

  execFileSync(process.execPath, [
    path.join(root, "scripts", "write-theme.mjs"), "custom", "--output-dir", temporary,
    "--image", "background.png", "--banner", "banner.png", "--name", "Authoring fixture",
  ], { encoding: "utf8" });
  const authored = JSON.parse(await fs.readFile(path.join(temporary, "theme.json"), "utf8"));
  assert.equal(authored.schemaVersion, 2);
  assert.equal(authored.home.banner, "banner.png", "The authoring CLI must retain an optional banner asset.");
  const preview = path.join(temporary, "draft-preview.html");
  const previewOutput = execFileSync(process.execPath, [
    path.join(root, "scripts", "preview-ip-theme.mjs"), "--theme-dir", temporary, "--output", preview,
  ], { encoding: "utf8" });
  assert.match(previewOutput, /Codex was not contacted or modified/,
    "A draft preview must explicitly remain outside the Codex runtime.");
  const previewHtml = await fs.readFile(preview, "utf8");
  assert.match(previewHtml, /object-fit: contain/, "The standalone preview must preserve IP art aspect ratio.");
  assert.equal((previewHtml.match(/class="cards"/g) || []).length, 1,
    "A draft preview must render its controlled four-card area.");

  await fs.writeFile(path.join(temporary, "background.mp4"), Buffer.from("video-fixture"));
  execFileSync(process.execPath, [
    path.join(root, "scripts", "write-theme.mjs"), "custom", "--output-dir", temporary,
    "--video", "background.mp4", "--name", "Video fixture",
  ], { encoding: "utf8" });
  const videoTheme = JSON.parse(await fs.readFile(path.join(temporary, "theme.json"), "utf8"));
  assert.equal(videoTheme.mediaType, "video");
  assert.equal(videoTheme.image, "background.mp4");
  const videoPayload = execFileSync(process.execPath, [
    path.join(root, "scripts", "injector.mjs"), "--check-payload", "--theme-dir", temporary,
  ], { encoding: "utf8" });
  assert.equal(JSON.parse(videoPayload).pass, true, "A bounded local video theme should build a payload.");

const invalid = { ...valid, home: { ...valid.home, suggestions: valid.home.suggestions.slice(0, 3) } };
  await fs.writeFile(path.join(temporary, "theme.json"), `${JSON.stringify(invalid)}\n`);
  assert.throws(() => execFileSync(process.execPath, [
    path.join(root, "scripts", "injector.mjs"), "--check-payload", "--theme-dir", temporary,
  ], { encoding: "utf8", stdio: "pipe" }), /home\.suggestions/);
  const invalidImmersive = { ...valid, art: { immersive: "yes" } };
  await fs.writeFile(path.join(temporary, "theme.json"), `${JSON.stringify(invalidImmersive)}\n`);
  assert.throws(() => execFileSync(process.execPath, [
    path.join(root, "scripts", "injector.mjs"), "--check-payload", "--theme-dir", temporary,
  ], { encoding: "utf8", stdio: "pipe" }), /art\.immersive/);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

console.log("PASS: schema v2 accepts an exactly-four-card IP home layer and rejects any other count.");
