import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(here, "..");
const template = await fs.readFile(path.join(windowsRoot, "assets", "renderer-inject.js"), "utf8");
const css = await fs.readFile(path.join(windowsRoot, "assets", "newskin.css"), "utf8");
const buildPayload = (config = {}) => template
  .replace("__DREAM_CSS_JSON__", JSON.stringify(".fixture { color: blue; }"))
  .replace("__DREAM_ART_JSON__", JSON.stringify("data:image/png;base64,AA=="))
  .replace("__DREAM_THEME_JSON__", JSON.stringify(config));
const payload = buildPayload();

assert.doesNotMatch(
  css,
  /main\.main-surface\s*>\s*header\.app-header-tint\s*\{[^}]*\b(?:position|z-index)\s*:/,
  "The skin must preserve Codex's native fixed header so the side-panel toggle remains reachable.",
);
assert.match(template, /home\.prepend\(layer\)/,
  "The selector must attach to the native home while its absolute CSS keeps it out of layout flow.");
assert.match(template, /layer\.append\(controls\)/,
  "The selector must mount as a direct compact control group, without a banner wrapper.");
assert.doesNotMatch(template, /newskin-ip-suggestions/,
  "The renderer must not create an additional suggestion-card row.");
assert.match(css, /Compact native-page theme controls[\s\S]{0,360}position:\s*absolute;[\s\S]{0,100}top:\s*14px;[\s\S]{0,100}right:\s*16px;/,
  "The selector must overlay the native page instead of consuming layout height.");
assert.match(template, /document\.createElement\("video"\)[\s\S]{0,500}video\.muted\s*=\s*true[\s\S]{0,180}video\.loop\s*=\s*true/,
  "Video themes must render as muted, looping native video elements rather than CSS backgrounds.");
assert.match(template, /video\.pause\(\)[\s\S]{0,180}video\?\.remove\(\)/,
  "Video cleanup must stop and remove the background media element.");
assert.match(template, /const videoHost = document\.querySelector\("main\.main-surface"\) \|\| document\.body;[\s\S]{0,120}videoHost\?\.prepend\(video\)/,
  "Video must mount inside the main surface when it is available, avoiding a native-header boundary seam.");
assert.match(template, /const ensureVideoControls = \(root\) => \{[\s\S]{0,2800}range\.type = "range"[\s\S]{0,900}面板不透明度/,
  "Video themes must expose persistent range controls for blur and panel opacity.");
assert.match(template, /const positionVideoControls = \(control\) => \{[\s\S]{0,1700}above-composer[\s\S]{0,900}--newskin-video-controls-bottom/,
  "Video controls must move above the composer when the right-side space is insufficient.");
assert.match(css, /newskin-video-theme \.dream-task[\s\S]{0,360}blur\(var\(--newskin-video-blur, 12px\)\)/,
  "Video surfaces must read their blur strength from the slider-controlled custom property.");
assert.match(css, /newskin-video-theme main\.main-surface > video#codex-newskin-video\.newskin-video-background\s*\{[\s\S]{0,180}position:\s*absolute;[\s\S]{0,180}z-index:\s*0;/,
  "The video must cover the main surface inside the same stacking context as the native header.");
assert.match(css, /newskin-video-theme \.newskin-home > div:not\(\.newskin-ip-layer\)\s*\{[\s\S]{0,120}padding-top:\s*0 !important;/,
  "Video homes must remove Codex's top spacer so no panel-tinted seam appears below the header.");
assert.match(css, /background-color:\s*color-mix\(in oklab, var\(--dream-surface\) var\(--newskin-video-panel-opacity, 72%\), transparent\)/,
  "Video surfaces must read panel opacity from the second slider-controlled custom property.");
assert.match(css, /right:\s*var\(--newskin-video-controls-right, 20px\);[\s\S]{0,100}bottom:\s*var\(--newskin-video-controls-bottom, 22px\);/,
  "Video control placement must be driven by measured composer space.");
assert.match(
  css,
  /newskin-video-theme main\.main-surface > header\.app-header-tint\s*\{[\s\S]{0,520}background:\s*transparent !important;[\s\S]{0,220}border-bottom:\s*0 !important;/,
  "Video themes must use the same transparent native header treatment as wide image themes.",
);
assert.match(
  css,
  /newskin-video-theme main\.main-surface\s*\{[\s\S]{0,220}border:\s*0 !important;[\s\S]{0,160}border-radius:\s*0 !important;/,
  "Video themes must remove the ordinary main-surface frame so no seam remains below the native header.",
);
assert.match(
  template,
  /if \(!root\.classList\.contains\("codex-newskin"\)\) root\.classList\.add\("codex-newskin"\);[\s\S]{0,220}root\.classList\.contains\("newskin-video-theme"\) !== videoTheme/,
  "Root theme classes must be guarded so their own mutation observer does not create a scroll-time render loop.",
);

function createFixture({
  shellPresent,
  staleSkin = false,
  homePresent = false,
  utilityPresent = false,
  shellAppearance = "dark",
  computedColorScheme = "",
  osAppearance = "light",
  analysisFixture = null,
}) {
  const nodes = new Map();
  const rootClasses = new Set(staleSkin ? ["codex-newskin"] : []);
  const rootStyles = new Map(staleSkin ? [["--dream-art", "url(\"blob:stale\")"]] : []);
  const revokedUrls = [];
  const observers = [];
  let objectUrlCount = 0;
  let hasShell = shellPresent;
  let hasTaskEvidence = false;
  let root;

  const queueRootClassMutation = () => {
    for (const observer of observers) {
      if (observer.target !== root || !observer.options?.attributes) continue;
      if (observer.options.attributeFilter && !observer.options.attributeFilter.includes("class")) continue;
      observer.records.push({ type: "attributes", attributeName: "class", target: root });
    }
  };
  const makeClassList = (classes = new Set(), onMutation = () => {}) => ({
    add(...values) {
      let changed = false;
      for (const value of values) {
        if (!classes.has(value)) { classes.add(value); changed = true; }
      }
      if (changed) onMutation();
    },
    remove(...values) {
      let changed = false;
      for (const value of values) changed = classes.delete(value) || changed;
      if (changed) onMutation();
    },
    toggle(value, enabled) {
      const changed = enabled ? !classes.has(value) : classes.has(value);
      if (enabled) classes.add(value);
      else classes.delete(value);
      if (changed) onMutation();
    },
    contains(value) { return classes.has(value); },
  });

  root = {
    className: shellAppearance,
    classList: makeClassList(rootClasses, queueRootClassMutation),
    getAttribute() { return null; },
    style: {
      setProperty(key, value) { rootStyles.set(key, value); },
      removeProperty(key) { rootStyles.delete(key); },
    },
    appendChild(node) {
      node.parentElement = root;
      nodes.set(node.id, node);
    },
  };
  const body = {
    className: "",
    getAttribute() { return null; },
    appendChild(node) {
      node.parentElement = body;
      nodes.set(node.id, node);
    },
  };
  const shellMain = {
    classList: makeClassList(),
    getBoundingClientRect() {
      return { left: 290, top: 36, width: 990, height: 784 };
    },
  };
  const routeClasses = new Set();
  const utilityClasses = new Set();
  const utilityNode = { classList: makeClassList(utilityClasses) };
  const composerEvents = [];
  const composer = {
    textContent: "",
    getAttribute() { return null; },
    focus() {},
    dispatchEvent(event) { composerEvents.push(event.type); return true; },
  };
  const routeMain = {
    classList: makeClassList(routeClasses),
    children: [],
    prepend(node) {
      node.parentElement = routeMain;
      routeMain.children.unshift(node);
      if (node.id) nodes.set(node.id, node);
    },
    querySelector(selector) {
      if (selector.includes('home-icon') || selector.includes('game-source')) return homePresent ? {} : null;
      if (selector.includes('contenteditable') || selector.includes('textarea') || selector.includes('composer-surface-chrome')) {
        return homePresent ? composer : null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[class*="_homeUtilityBar_"]' && utilityPresent) return [utilityNode];
      return [];
    },
  };
  const staleHome = { classList: makeClassList(new Set(["dream-home"])) };
  const staleShell = { classList: makeClassList(new Set(["dream-home-shell"])) };

  const createElement = (tagName) => {
    if (tagName === "canvas" && analysisFixture) {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() { return { data: analysisFixture.pixels }; },
          };
        },
      };
    }
    const listeners = new Map();
    const children = [];
    return {
      id: "",
      dataset: {},
      style: {},
      classList: makeClassList(),
      parentElement: null,
      textContent: "",
      innerHTML: "",
      children,
      setAttribute() {},
      getAttribute() { return null; },
      append(...items) { children.push(...items); for (const item of items) item.parentElement = this; },
      appendChild(item) { children.push(item); item.parentElement = this; return item; },
      replaceChildren(...items) { children.splice(0, children.length, ...items); for (const item of items) item.parentElement = this; },
      addEventListener(name, handler) { listeners.set(name, handler); },
      click() { listeners.get("click")?.(); },
      remove() { nodes.delete(this.id); },
    };
  };
  if (staleSkin) {
    const style = createElement();
    style.id = "codex-newskin-style";
    nodes.set(style.id, style);
    const chrome = createElement();
    chrome.id = "codex-newskin-chrome";
    nodes.set(chrome.id, chrome);
  }

  const document = {
    documentElement: root,
    head: root,
    body,
    createElement,
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector.includes('data-message-author-role') || selector.includes('data-testid*="message"')) {
        return hasTaskEvidence ? {} : null;
      }
      if (selector === "main.main-surface") return hasShell ? shellMain : null;
      if (selector === "aside.app-shell-left-panel") return hasShell ? {} : null;
      if (selector === '[role="main"]:has([data-testid="home-icon"])') {
        return hasShell && homePresent ? routeMain : null;
      }
      if (selector.includes('[role="main"].dream-home') && (selector.includes('contenteditable') || selector.includes('textarea'))) {
        return homePresent ? composer : null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[role="main"]') return hasShell ? [routeMain] : [];
      if (selector === ".dream-task") return routeClasses.has("dream-task") ? [routeMain] : [];
      if (selector === ".dream-home-utility") {
        return utilityClasses.has("dream-home-utility") ? [utilityNode] : [];
      }
      if (!staleSkin) return [];
      if (selector === ".dream-home") return [staleHome];
      if (selector === ".dream-home-shell") return [staleShell];
      return [];
    },
  };
  const context = {
    window: {
      matchMedia() { return { matches: osAppearance === "dark" }; },
    },
    document,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.records = [];
        this.target = null;
        this.options = null;
        observers.push(this);
      }
      observe(target, options = {}) {
        this.target = target;
        this.options = options;
      }
      disconnect() {
        this.target = null;
        this.records = [];
      }
      takeRecords() {
        const records = this.records;
        this.records = [];
        return records;
      }
    },
    URL: {
      createObjectURL() { objectUrlCount += 1; return `blob:fixture-${objectUrlCount}`; },
      revokeObjectURL(value) { revokedUrls.push(value); },
    },
    Blob,
    Uint8Array,
    atob,
    Event: class { constructor(type) { this.type = type; } },
    InputEvent: class { constructor(type) { this.type = type; } },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 2,
    clearTimeout: () => {},
    getComputedStyle() { return { colorScheme: computedColorScheme }; },
  };
  if (analysisFixture) {
    context.Image = class {
      naturalWidth = analysisFixture.naturalWidth;
      naturalHeight = analysisFixture.naturalHeight;
      set src(_) { this.onload(); }
    };
  }

  return {
    context,
    nodes,
    observers,
    rootClasses,
    rootStyles,
    revokedUrls,
    routeClasses,
    utilityClasses,
    composer,
    composerEvents,
    routeMain,
    setTaskEvidence(value) { hasTaskEvidence = value; },
    setShellPresent(value) { hasShell = value; },
  };
}

const main = createFixture({ shellPresent: true });
const mainResult = vm.runInNewContext(payload, main.context);
assert.equal(mainResult.installed, true);
assert.equal(main.rootClasses.has("codex-newskin"), true);
assert.equal(main.rootStyles.get("--dream-art"), 'url("blob:fixture-1")');
assert.equal(main.nodes.has("codex-newskin-style"), true);
assert.equal(main.nodes.has("codex-newskin-chrome"), true);
assert.equal(main.rootClasses.has("dream-theme-dark"), true);
assert.equal(main.rootClasses.has("dream-art-standard"), true);
assert.equal(main.rootClasses.has("dream-task-ambient"), true);
assert.equal(main.routeClasses.has("dream-task"), true);
assert.equal(main.context.window.__CODEX_NEWSKIN_STATE__.cleanup(), true);
assert.equal(main.rootClasses.has("codex-newskin"), false);
assert.equal(main.rootClasses.has("dream-theme-dark"), false);
assert.equal(main.nodes.has("codex-newskin-style"), false);
assert.equal(main.nodes.has("codex-newskin-chrome"), false);
assert.deepEqual(main.revokedUrls, ["blob:fixture-1"]);

const reinjected = createFixture({ shellPresent: true });
vm.runInNewContext(payload, reinjected.context);
const firstState = reinjected.context.window.__CODEX_NEWSKIN_STATE__;
vm.runInNewContext(payload, reinjected.context);
const secondState = reinjected.context.window.__CODEX_NEWSKIN_STATE__;
assert.notEqual(secondState.installToken, firstState.installToken);
assert.equal(secondState.artUrl, "blob:fixture-2");
assert.equal(reinjected.rootStyles.get("--dream-art"), 'url("blob:fixture-2")');
assert.deepEqual(reinjected.revokedUrls, ["blob:fixture-1"]);
assert.equal(firstState.cleanup(), false);
assert.equal(secondState.cleanup(), true);

const auxiliary = createFixture({ shellPresent: false, staleSkin: true });
const auxiliaryResult = vm.runInNewContext(payload, auxiliary.context);
assert.equal(auxiliaryResult.installed, true);
assert.equal(auxiliary.rootClasses.has("codex-newskin"), false);
assert.equal(auxiliary.rootStyles.has("--dream-art"), false);
assert.equal(auxiliary.nodes.has("codex-newskin-style"), false);
assert.equal(auxiliary.nodes.has("codex-newskin-chrome"), false);

auxiliary.setShellPresent(true);
auxiliary.context.window.__CODEX_NEWSKIN_STATE__.ensure();
assert.equal(auxiliary.rootClasses.has("codex-newskin"), true);
assert.equal(auxiliary.nodes.has("codex-newskin-style"), true);
assert.equal(auxiliary.nodes.has("codex-newskin-chrome"), true);

const configured = createFixture({
  shellPresent: true,
  homePresent: true,
  utilityPresent: true,
});
const configuredPayload = buildPayload({
  appearance: "light",
  palette: { accent: "#d45a70" },
  art: { focusX: .15, focusY: .8, safeArea: "right", taskMode: "off" },
});
const configuredResult = vm.runInNewContext(configuredPayload, configured.context);
assert.equal(configuredResult.adaptive, true);
assert.equal(configured.rootClasses.has("dream-theme-light"), true);
assert.equal(configured.rootClasses.has("dream-theme-dark"), false);
assert.equal(configured.rootClasses.has("dream-focus-left"), true);
assert.equal(configured.rootClasses.has("dream-safe-right"), true);
assert.equal(configured.rootClasses.has("dream-task-off"), true);
assert.equal(configured.rootStyles.get("--dream-art-position"), "15% 80%");
assert.equal(configured.rootStyles.get("--dream-accent"), "#d45a70");
assert.equal(configured.routeClasses.has("dream-home"), true);
assert.equal(configured.routeClasses.has("dream-task"), false);
assert.equal(configured.utilityClasses.has("dream-home-utility"), true);
assert.equal(configured.context.window.__CODEX_NEWSKIN_STATE__.cleanup(), true);
assert.equal(configured.utilityClasses.has("dream-home-utility"), false);

const ipHome = createFixture({ shellPresent: true, homePresent: true });
const ipHomePayload = buildPayload({
  id: "ip-home",
  name: "IP Home",
  home: {
    enabled: true,
  },
  availableThemes: [{ id: "ip-home", name: "IP Home" }, { id: "saved", name: "Saved" }],
});
vm.runInNewContext(ipHomePayload, ipHome.context);
const ipLayer = ipHome.nodes.get("codex-newskin-ip-layer");
assert.ok(ipLayer, "A configured IP layer should mount only on a verified blank home.");
const controls = ipLayer.children[0];
assert.equal(controls.children.length, 3, "The switcher should contain two saved themes and native mode.");
assert.equal(ipLayer.children.length, 1, "The switcher must not create a banner or suggestion-card row.");
controls.children[1].click();
assert.equal(ipHome.context.window.__CODEX_NEWSKIN_UI_CONTROL_REQUEST__.action, "select-theme");
assert.equal(ipHome.context.window.__CODEX_NEWSKIN_UI_CONTROL_REQUEST__.id, "saved");
assert.match(ipHome.context.window.__CODEX_NEWSKIN_UI_CONTROL_REQUEST__.nonce, /^\d+:[a-z0-9]+$/);
ipHome.setTaskEvidence(true);
ipHome.context.window.__CODEX_NEWSKIN_STATE__.ensure();
assert.equal(ipHome.nodes.has("codex-newskin-ip-layer"), false,
  "Task evidence must remove the banner and switcher without waiting for navigation.");

const analysisPixels = new Uint8ClampedArray(48 * 12 * 4);
for (let index = 0; index < 48 * 12; index += 1) {
  const offset = index * 4;
  const x = index % 48;
  const subject = x >= 34 && x <= 42;
  analysisPixels[offset] = subject ? 210 : 246;
  analysisPixels[offset + 1] = subject ? 84 : 239;
  analysisPixels[offset + 2] = subject ? 112 : 237;
  analysisPixels[offset + 3] = 255;
}
const analyzed = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 1200, naturalHeight: 400, pixels: analysisPixels },
});
vm.runInNewContext(payload, analyzed.context);
await Promise.resolve();
assert.equal(analyzed.rootClasses.has("dream-theme-dark"), true);
assert.equal(analyzed.rootClasses.has("dream-theme-light"), false);
assert.equal(analyzed.rootClasses.has("dream-art-wide"), true);
assert.equal(analyzed.rootClasses.has("dream-task-banner"), true);
assert.equal(analyzed.rootClasses.has("dream-safe-left"), true);
assert.notEqual(analyzed.rootStyles.get("--dream-accent"), "rgb(216 104 119)");

const standardArt = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 800, naturalHeight: 800, pixels: analysisPixels },
});
vm.runInNewContext(payload, standardArt.context);
await Promise.resolve();
assert.equal(standardArt.rootClasses.has("dream-art-standard"), true);
assert.equal(standardArt.rootClasses.has("dream-task-ambient"), true);
assert.equal(standardArt.rootClasses.has("dream-task-banner"), false);

const mediumWide = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 2100, naturalHeight: 1000, pixels: analysisPixels },
});
vm.runInNewContext(payload, mediumWide.context);
await Promise.resolve();
assert.equal(mediumWide.rootClasses.has("dream-art-wide"), true);
assert.equal(mediumWide.rootClasses.has("dream-task-ambient"), true);
assert.equal(mediumWide.rootClasses.has("dream-task-banner"), false);

const nativeLight = createFixture({ shellPresent: true, shellAppearance: "light" });
vm.runInNewContext(payload, nativeLight.context);
assert.equal(nativeLight.rootClasses.has("dream-theme-light"), true);
assert.equal(nativeLight.rootClasses.has("dream-theme-dark"), false);

const nativeComputedDark = createFixture({
  shellPresent: true,
  shellAppearance: "",
  computedColorScheme: "dark",
  osAppearance: "light",
});
vm.runInNewContext(payload, nativeComputedDark.context);
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-dark"), true);
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-light"), false);
nativeComputedDark.context.window.__CODEX_NEWSKIN_STATE__.ensure();
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-dark"), true);
const nativeObserver = nativeComputedDark.observers[0];
nativeObserver.takeRecords();
nativeComputedDark.context.window.__CODEX_NEWSKIN_STATE__.ensure();
assert.equal(nativeObserver.takeRecords().length, 0,
  "Sampling the native computed color-scheme must not queue a self-triggering root mutation pass.");

const metadataWide = createFixture({ shellPresent: true });
vm.runInNewContext(buildPayload({ artMetadata: { ratio: 16 / 9 } }), metadataWide.context);
assert.equal(metadataWide.rootClasses.has("dream-art-wide"), true);
assert.equal(metadataWide.rootClasses.has("dream-art-standard"), false);

console.log("PASS: renderer applies adaptive theme metadata and preserves transparent auxiliary windows.");
