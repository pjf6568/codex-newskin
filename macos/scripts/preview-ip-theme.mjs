import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

function requiredArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!value || value.startsWith("--")) throw new Error(`Usage: preview-ip-theme.mjs --theme-dir <draft-dir> --output <preview.html>`);
  return path.resolve(value);
}

function text(value, field, fallback, maximum) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || /[\p{Cc}\u2028\u2029]/u.test(value)) {
    throw new Error(`${field} must be a single-line string`);
  }
  return Array.from(value.trim()).slice(0, maximum).join("") || fallback;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function mimeType(name) {
  const extension = path.extname(name).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  throw new Error(`Unsupported preview image format: ${extension || "missing"}`);
}

async function imageDataUrl(root, name, field) {
  if (typeof name !== "string" || !name || path.basename(name) !== name) {
    throw new Error(`${field} must be a local image filename`);
  }
  const file = path.join(root, name);
  const realFile = await fs.realpath(file);
  const relative = path.relative(root, realFile);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${field} must stay inside the draft directory`);
  }
  const stat = await fs.stat(realFile);
  if (!stat.isFile() || stat.size < 1 || stat.size > 16 * 1024 * 1024) {
    throw new Error(`${field} must be a non-empty image no larger than 16 MB`);
  }
  return `data:${mimeType(name)};base64,${(await fs.readFile(realFile)).toString("base64")}`;
}

async function atomicWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, value, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(temporary, file);
    await fs.chmod(file, 0o600);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

const draftDir = requiredArg("theme-dir");
const output = requiredArg("output");
const realDraft = await fs.realpath(draftDir);
const raw = JSON.parse(await fs.readFile(path.join(realDraft, "theme.json"), "utf8"));
if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("theme.json must be an object");
const home = raw.home;
if (!home || typeof home !== "object" || Array.isArray(home) || home.enabled === false) {
  throw new Error("A preview requires an enabled home object");
}
if (!Array.isArray(home.suggestions) || home.suggestions.length !== 4) {
  throw new Error("A preview requires exactly four home suggestions");
}
const name = text(raw.name, "name", "Codex Newskin", 80);
const title = text(home.title, "home.title", name, 100);
const subtitle = text(home.subtitle, "home.subtitle", raw.tagline || "", 160);
const cards = home.suggestions.map((item, index) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`home.suggestions[${index}] must be an object`);
  return text(item.title, `home.suggestions[${index}].title`, `建议 ${index + 1}`, 64);
});
const background = await imageDataUrl(realDraft, raw.image, "image");
const banner = home.banner === undefined ? background : await imageDataUrl(realDraft, home.banner, "home.banner");

const html = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(name)} · 预览</title>
<style>
  :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; } body { margin: 0; min-height: 100vh; color: #f5f5f7; background: #11131a url("${background}") center / cover fixed; }
  main { min-height: 100vh; padding: clamp(24px,7vh,84px) 16px; background: rgb(10 12 18 / .58); }
  .note { width: min(100%,900px); margin: 0 auto 12px; color: #d7d9e2; font-size: 13px; }
  .layer { width: min(100%,900px); margin: auto; } .banner { position: relative; min-height: 190px; overflow: hidden; border: 1px solid rgb(255 255 255 / .2); border-radius: 22px; background: #1b1e29; isolation: isolate; }
  .art { position: absolute; inset: 0; z-index: -1; width: 100%; height: 100%; object-fit: contain; background: rgb(0 0 0 / .24); }
  .copy { display: flex; min-height: 190px; max-width: 68%; flex-direction: column; justify-content: center; padding: 30px clamp(22px,5vw,54px); background: linear-gradient(90deg, rgb(20 23 33 / .95), rgb(20 23 33 / .68) 58%, transparent); }
  h1 { margin: 0; font-size: clamp(28px,4vw,45px); line-height: 1.12; } p { margin: 10px 0 0; color: #d7d9e2; line-height: 1.5; }
  .controls { position: absolute; top: 12px; right: 12px; display: flex; flex-wrap: wrap; justify-content: end; gap: 8px; max-width: 70%; } button { border: 1px solid rgb(255 255 255 / .25); border-radius: 999px; padding: 7px 11px; color: inherit; background: rgb(20 23 33 / .8); font: inherit; font-size: 12px; } button[aria-pressed="true"] { border-color: #91b5ff; background: rgb(91 130 220 / .28); }
  .cards { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; margin-top: 10px; } .cards button { min-height: 62px; border-radius: 14px; text-align: left; font-size: 13px; }
  @media (max-width:720px) { .copy { max-width:none; min-height:154px; padding:60px 20px 20px; } .controls { left:12px; right:12px; max-width:none; justify-content:start; } .cards { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
<main><p class="note">本地草稿预览：未连接 Codex，未写入活动主题。</p><section class="layer" aria-label="${escapeHtml(name)} 预览"><div class="banner"><img class="art" alt="" src="${banner}"><div class="copy"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div><div class="controls"><button aria-pressed="true">${escapeHtml(name)}</button><button>原生主题</button></div></div><div class="cards">${cards.map((card) => `<button>${escapeHtml(card)}</button>`).join("")}</div></section></main>`;

await atomicWrite(output, html);
console.log(`Preview written to ${output}. Codex was not contacted or modified.`);
