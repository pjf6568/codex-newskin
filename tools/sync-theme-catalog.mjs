import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogRoot = path.join(root, "themes");
const registryPath = path.join(catalogRoot, "registry.json");
const write = process.argv.slice(2).includes("--write");

if (process.argv.slice(2).some((argument) => argument !== "--write")) {
  throw new Error("Usage: node tools/sync-theme-catalog.mjs [--write]");
}

const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
assert.equal(registry.schemaVersion, 1, "Theme registry schema must be version 1.");
assert.ok(Array.isArray(registry.themes) && registry.themes.length > 0,
  "Theme registry must list at least one theme.");

const ids = new Set();
const expected = new Map();
const expectedIdsByPlatform = new Map([["macos", new Set()], ["windows", new Set()]]);
for (const entry of registry.themes) {
  assert.match(entry.id, /^preset-[a-z0-9-]+$/, "Theme IDs must use preset-<slug>.");
  assert.ok(!ids.has(entry.id), `Theme registry contains duplicate ID: ${entry.id}`);
  ids.add(entry.id);
  assert.ok(Array.isArray(entry.platforms) && entry.platforms.length > 0,
    `${entry.id} must target at least one platform.`);

  const sourceDirectory = path.join(catalogRoot, entry.id);
  const sourceThemePath = path.join(sourceDirectory, "theme.json");
  const sourceTheme = JSON.parse(await fs.readFile(sourceThemePath, "utf8"));
  assert.equal(sourceTheme.id, entry.id, `${entry.id} theme.json has a mismatched ID.`);
  assert.ok(typeof sourceTheme.image === "string" && sourceTheme.image.length > 0,
    `${entry.id} must declare its media filename.`);
  assert.equal(path.basename(sourceTheme.image), sourceTheme.image,
    `${entry.id} media must stay beside theme.json.`);
  const sourceMediaPath = path.join(sourceDirectory, sourceTheme.image);
  const mediaStat = await fs.stat(sourceMediaPath);
  assert.ok(mediaStat.isFile() && mediaStat.size > 0, `${entry.id} media is missing or empty.`);
  const inferredMediaType = /\.(mp4|mov|webm)$/i.test(sourceTheme.image) ? "video" : "image";
  assert.equal(sourceTheme.mediaType ?? "image", inferredMediaType,
    `${entry.id} mediaType does not match its media extension.`);

  for (const platform of entry.platforms) {
    assert.ok(["macos", "windows"].includes(platform),
      `${entry.id} has an unsupported platform: ${platform}`);
    const directory = platform === "macos"
      ? path.join(root, "macos", "presets", entry.id)
      : path.join(root, "windows", "assets", "presets", entry.id);
    expectedIdsByPlatform.get(platform).add(entry.id);
    expected.set(`${platform}:${entry.id}`, { directory, sourceThemePath, sourceMediaPath, sourceTheme });
  }
}

assert.ok(Array.isArray(registry.templates), "Theme registry must declare its generated templates.");
const templateIds = new Set();
for (const entry of registry.templates) {
  assert.match(entry.id, /^[a-z0-9-]+$/, "Template IDs must use lowercase slugs.");
  assert.ok(!templateIds.has(entry.id), `Theme registry contains duplicate template ID: ${entry.id}`);
  templateIds.add(entry.id);
  assert.equal(entry.platform, "macos", `${entry.id} targets an unsupported platform.`);
  assert.equal(entry.output, "assets", `${entry.id} has an unsupported generated output.`);

  const sourceDirectory = path.join(catalogRoot, "templates", entry.id);
  const sourceThemePath = path.join(sourceDirectory, "theme.json");
  const sourceTheme = JSON.parse(await fs.readFile(sourceThemePath, "utf8"));
  assert.ok(typeof sourceTheme.image === "string" && sourceTheme.image.length > 0,
    `${entry.id} must declare its media filename.`);
  assert.equal(path.basename(sourceTheme.image), sourceTheme.image,
    `${entry.id} media must stay beside theme.json.`);
  const sourceMediaPath = path.join(sourceDirectory, sourceTheme.image);
  const mediaStat = await fs.stat(sourceMediaPath);
  assert.ok(mediaStat.isFile() && mediaStat.size > 0, `${entry.id} media is missing or empty.`);
  expected.set(`template:${entry.id}`, {
    directory: path.join(root, "macos", "assets"), sourceThemePath, sourceMediaPath, sourceTheme,
  });
}

async function filesMatch(left, right) {
  try {
    const [leftBytes, rightBytes] = await Promise.all([fs.readFile(left), fs.readFile(right)]);
    return createHash("sha256").update(leftBytes).digest("hex") ===
      createHash("sha256").update(rightBytes).digest("hex");
  } catch {
    return false;
  }
}

let deliveries = 0;
for (const [key, { directory, sourceThemePath, sourceMediaPath, sourceTheme }] of expected) {
  const targetThemePath = path.join(directory, "theme.json");
  const targetMediaPath = path.join(directory, sourceTheme.image);
  if (write) {
    if (!key.startsWith("template:")) {
      await fs.rm(directory, { recursive: true, force: true });
    }
    await fs.mkdir(directory, { recursive: true });
    await Promise.all([
      fs.copyFile(sourceThemePath, targetThemePath),
      fs.copyFile(sourceMediaPath, targetMediaPath),
    ]);
  } else {
    assert.ok(await filesMatch(sourceThemePath, targetThemePath),
      `Generated theme config is stale: ${path.relative(root, targetThemePath)}. Run sync-theme-catalog.mjs --write.`);
    assert.ok(await filesMatch(sourceMediaPath, targetMediaPath),
      `Generated media is stale: ${path.relative(root, targetMediaPath)}. Run sync-theme-catalog.mjs --write.`);
  }
  deliveries += 1;
}

for (const [platform, expectedIds] of expectedIdsByPlatform) {
  const outputRoot = platform === "macos"
    ? path.join(root, "macos", "presets")
    : path.join(root, "windows", "assets", "presets");
  const entries = await fs.readdir(outputRoot, { withFileTypes: true });
  const actualIds = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("preset-"))
    .map((entry) => entry.name)
    .sort();
  const unexpectedIds = actualIds.filter((id) => !expectedIds.has(id));
  if (write) {
    await Promise.all(unexpectedIds.map((id) =>
      fs.rm(path.join(outputRoot, id), { recursive: true, force: true })));
  } else {
    assert.deepEqual(actualIds, [...expectedIds].sort(),
      `${platform} generated packs do not match themes/registry.json. Run sync-theme-catalog.mjs --write.`);
  }
}

console.log(`PASS: ${ids.size} canonical themes, ${templateIds.size} canonical templates, and ${deliveries} generated platform packs are synchronized.`);
