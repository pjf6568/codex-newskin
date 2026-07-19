import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const template = await fs.readFile(path.join(macosRoot, "assets", "renderer-inject.js"), "utf8");
const css = await fs.readFile(path.join(macosRoot, "assets", "newskin.css"), "utf8");

assert.doesNotMatch(
  css,
  /main\.main-surface\s*>\s*header\.app-header-tint\s*\{[^}]*\b(?:position|z-index)\s*:/,
  "The skin must preserve Codex's native fixed header so the side-panel toggle remains reachable.",
);
assert.doesNotMatch(
  css,
  /main\.main-surface:not\(\.newskin-home-shell\)\s*>\s*\*\s*\{[^}]*\bposition\s*:/,
  "Task-route child layering must not overwrite the native header position.",
);

assert.doesNotMatch(
  css,
  /background-image:\s*var\(--newskin-art\),\s*var\(--newskin-art\)/,
  "The home hero must not stack duplicate copies of the selected image.",
);
assert.match(template, /document\.createElement\("video"\)[\s\S]{0,500}video\.muted\s*=\s*true[\s\S]{0,180}video\.loop\s*=\s*true/,
  "Video themes must render as muted, looping native video elements rather than CSS backgrounds.");
assert.match(template, /video\.pause\(\)[\s\S]{0,180}video\?\.remove\(\)/,
  "Video cleanup must stop and remove the background media element.");
assert.match(template, /const videoHost = document\.querySelector\("main\.main-surface"\) \|\| document\.body;[\s\S]{0,520}video\.parentElement !== videoHost/,
  "Video must remain in the main content surface so its lifecycle follows Codex route changes.");
assert.match(
  template,
  /if \(!root\.classList\.contains\("codex-newskin"\)\) root\.classList\.add\("codex-newskin"\);[\s\S]{0,220}root\.classList\.contains\("newskin-video-theme"\) !== VIDEO_THEME/,
  "Root theme classes must be guarded so their own mutation observer does not create a scroll-time render loop.",
);
assert.match(template, /const ensureVideoControls = \(root\) => \{[\s\S]{0,2800}range\.type = "range"[\s\S]{0,900}面板不透明度/,
  "Video themes must expose persistent range controls for blur and panel opacity.");
assert.match(template, /VIDEO_THEME && node\.matches\?\.\("\.composer-surface-chrome"\)\) return "videoComposer"/,
  "The inline composer surface token must be video-aware so it cannot pin the video opacity slider at a fixed value.");
assert.match(template, /videoComposer:\s*`rgb\(\$\{raisedRgb\} \/ var\(\$\{VIDEO_PANEL_OPACITY_PROPERTY\}, 72%\)\)`/,
  "The video composer token must read the same opacity custom property as the slider.");
assert.match(template, /const positionVideoControls = \(control\) => \{[\s\S]{0,2400}minimumControlsWidth[\s\S]{0,2400}--newskin-video-controls-width[\s\S]{0,2400}above-composer[\s\S]{0,2400}--newskin-video-controls-bottom/,
  "Video controls must shrink into the usable space beside the composer, then move above it only when no usable side space remains.");
assert.match(css, /newskin-video-theme main\.main-surface\s*\{[\s\S]{0,360}blur\(var\(--newskin-video-blur, 12px\)\)/,
  "The video main content surface must read blur strength from the slider-controlled custom property.");
assert.match(css, /newskin-video-theme \.composer-surface-chrome\s*\{[\s\S]{0,360}blur\(var\(--newskin-video-blur, 12px\)\)/,
  "The video composer must read blur strength from the slider-controlled custom property.");
assert.doesNotMatch(css, /newskin-video-theme main\.main-surface,\s*html\.codex-newskin\.newskin-video-theme aside\.app-shell-left-panel/,
  "Video controls must not alter the sidebar; they apply only to content surfaces.");
assert.match(css, /main\.main-surface > video#codex-newskin-video\.newskin-video-background\s*\{[\s\S]{0,180}position:\s*absolute;[\s\S]{0,180}z-index:\s*0;/,
  "Video must be layered inside the main content surface.");
assert.match(css, /newskin-video-theme \.newskin-home > div:not\(\.newskin-ip-layer\)\s*\{[\s\S]{0,120}padding-top:\s*0 !important;/,
  "Video homes must remove Codex's top spacer so no panel-tinted seam appears below the header.");
assert.match(css, /background-color:\s*rgb\(var\(--ds-panel-rgb\) \/ var\(--newskin-video-panel-opacity, 72%\)\)/,
  "Video surfaces must read panel opacity from the second slider-controlled custom property.");
assert.match(css, /newskin-video-theme \.composer-surface-chrome\s*\{[\s\S]{0,360}background:\s*rgb\(var\(--ds-panel-rgb\) \/ var\(--newskin-video-panel-opacity, 72%\)\)/,
  "The video composer must read panel opacity from the second slider-controlled custom property.");
assert.match(css, /right:\s*var\(--newskin-video-controls-right, 20px\);[\s\S]{0,100}bottom:\s*var\(--newskin-video-controls-bottom, 22px\);/,
  "Video control placement must be driven by measured composer space.");
assert.match(css, /width:\s*var\(--newskin-video-controls-width, 218px\);/,
  "Video controls must accept an adaptive width when placed beside the composer.");
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
  css,
  /newskin-video-theme main\.main-surface\s*[\s\S]{0,180}\.app-shell-main-content-frame\s*\{[\s\S]{0,180}background:\s*transparent !important;[\s\S]{0,300}\.app-shell-main-content-top-fade\s*\{[\s\S]{0,160}display:\s*none !important;/,
  "Video themes must remove Codex's native top-content fade so the header joins the moving picture without a colour-filled strip.",
);
for (const variable of [
  "--color-token-terminal-background",
  "--vscode-terminal-background",
  "--vscode-terminal-foreground",
  "--vscode-terminalCursor-foreground",
  "--vscode-terminal-selectionBackground",
]) {
  assert.match(
    css,
    new RegExp(`${variable.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\s*:`),
    `Terminal surface must define ${variable} instead of inheriting Codex's native light fallback.`,
  );
}
assert.match(
  css,
  /\[id\^="terminal-panel-"\]\s*\{[\s\S]{0,1800}--color-background-surface:\s*var\(--ds-terminal-bg\) !important;/,
  "A terminal-local light palette must not override the skin after the panel mounts.",
);
assert.match(
  css,
  /\[id\^="terminal-panel-"\][\s\S]{0,160}\.xterm-viewport\)\s*\{[\s\S]{0,180}background-color:\s*var\(--ds-terminal-bg\) !important;/,
  "xterm's inline white viewport must be forced onto the semantic terminal background.",
);
assert.match(
  css,
  /\[id\^="terminal-panel-"\][\s\S]{0,100}\.xterm-rows \*\s*\{[\s\S]{0,100}color:\s*var\(--ds-terminal-fg\) !important;/,
  "xterm DOM renderer text must retain contrast after the terminal palette is normalized.",
);
assert.match(
  css,
  /\[class\*="bg-token-main-surface-primary"\]:has\(\[id\^="terminal-panel-"\]\)[\s\S]{0,220}background-color:\s*rgb\(var\(--ds-panel-rgb\) \/ \.94\) !important;/,
  "The dock owning terminal-panel must use the semantic terminal toolbar surface.",
);
assert.match(
  css,
  /\[class\*="bg-token-main-surface-primary"\]:has\(\[id\^="terminal-panel-"\]\) \[class\*="group\/tab"\]\s*\{[\s\S]{0,200}background-color:\s*rgb\(var\(--ds-panel-2-rgb\) \/ \.92\) !important;/,
  "The selected terminal tab must share the raised description-card surface instead of remaining white.",
);
assert.match(
  css,
  /\[class\*="group\/tab"\] > \[class\*="app-shell-tab-background"\]\s*\{[\s\S]{0,120}background:\s*rgb\(var\(--ds-panel-2-rgb\) \/ \.92\) !important;/,
  "The terminal tab's absolute background child must not paint its native near-white surface over the themed tab.",
);
assert.match(
  css,
  /\.loading-shimmer-pure-text,[\s\S]{0,180}-webkit-text-fill-color:\s*var\(--ds-text\) !important;/,
  "Agent activity shimmer labels must keep a readable theme-text base between highlight sweeps.",
);
assert.match(
  template,
  /sidebarItem:\s*"transparent",[\s\S]{0,260}selected:\s*`rgb\(\$\{accentRgb\} \/ \.12\)`,/,
  "The centralized surface palette must reserve separate roles for ordinary and active sidebar navigation.",
);
assert.match(
  template,
  /if \(inSidebar && \/token-\(\?:sidebar-surface\|list-hover-background\)\/[\s\S]{0,180}return activeSidebarItem \? "selected" : "sidebarItem";/,
  "The centralized surface function must distinguish ordinary sidebar navigation from the current destination.",
);
assert.match(
  template,
  /\[role="listitem"\] \[class\*="cursor-grab"\]\[class\*="active:cursor-grabbing"\][\s\S]{0,120}return "sidebarItem";/,
  "Expanded project history drag wrappers must join the centralized sidebar-item surface role.",
);
assert.match(
  template,
  /menuItem:\s*\{[\s\S]{0,180}background:\s*"transparent"[\s\S]{0,420}menuCurrent:\s*\{/,
  "Dropdown menus must define distinct ordinary-item and current-item controls.",
);
assert.match(
  template,
  /const controlRoleForNode[\s\S]{0,2300}const inMenu = Boolean\(node\.closest\?\.\('\[role="menu"\], \[role="listbox"\], \[data-radix-popper-content-wrapper\]'\)\);[\s\S]{0,500}return node\.matches\?\.[\s\S]{0,260}\? "menuCurrent" : "menuItem";/,
  "Dropdown menus must use the same ordinary-item/current-item semantic split as navigation.",
);
assert.match(
  template,
  /bg-token-foreground\/5[\s\S]{0,120}return "selected";/,
  "User chat bubbles must reuse the selected semantic surface used by active navigation.",
);
assert.match(
  template,
  /fileIcon:\s*`rgb\(\$\{raisedRgb\} \/ \.92\)`[\s\S]{0,1200}return "fileIcon";/,
  "Completed-file icon tiles must be assigned a centralized raised-surface role.",
);
assert.match(
  css,
  /Completed-file rows[\s\S]{0,680}background-color:\s*rgb\(var\(--ds-panel-2-rgb\) \/ \.92\) !important;[\s\S]{0,260}color:\s*var\(--ds-accent\) !important;/,
  "Completed-file icon tiles must use the theme panelAlt and accent variables rather than a native white fill.",
);
assert.match(
  template,
  /\.thread-scroll-container \.bg-gradient-to-t\.from-token-main-surface-primary[\s\S]{0,100}return "composerBackdrop";/,
  "The full-width native composer fade must stay transparent instead of becoming a white panel behind the input.",
);
assert.match(
  template,
  /group\\\/navigation-row[\s\S]{0,100}return "progress";/,
  "Conversation progress rail nodes must use a transparent progress-control role instead of a raised card surface.",
);
assert.match(
  template,
  /group\\\/section-toggle[\s\S]{0,100}return "navigation";/,
  "Project section headers must inherit the transparent sidebar surface rather than a raised card fill.",
);
assert.match(
  template,
  /const sidebarThreadRow = node\.matches\?\.\('\[data-app-action-sidebar-thread-row\]'\)[\s\S]{0,900}return active \? "navigationCurrent" : "navigation";/,
  "Sidebar navigation controls and their DnD wrappers must not inherit the raised secondary-button surface.",
);
assert.match(
  css,
  /aside\.app-shell-left-panel \[class~="bg-token-list-hover-background"\]:not\(\[aria-current="page"\]\)[\s\S]{0,700}background:\s*transparent !important;/,
  "Unselected sidebar entries must inherit the navigation background instead of rendering as stacked raised cards.",
);
assert.match(
  css,
  /\[role="listitem"\][\s\S]{0,140}\[class\*="cursor-grab"\]\[class\*="active:cursor-grabbing"\][\s\S]{0,180}background:\s*transparent !important;/,
  "Expanded project history drag wrappers must not cover the semantic session-row background.",
);
assert.match(
  css,
  /aside\.app-shell-left-panel :is\(\[aria-current="page"\], \[data-state="active"\], \[data-active="true"\]\)\s*\{[\s\S]{0,220}rgb\(var\(--ds-accent-rgb\) \/ \.12\) !important;/,
  "Only the active sidebar destination should use the theme accent surface.",
);
assert.match(
  css,
  /data-dream-art-safe="left"[\s\S]{0,140}--ds-art-position:\s*100% var\(--ds-focus-y\);/,
  "A left text-safe image must preserve its right-side subject on narrower windows.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*auto 100% !important;/,
  "Wide home artwork must not leave an unpainted half-card by fitting only to height.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*100% 100%,\s*100% 100%,\s*100% auto;/,
  "Wide task artwork must cover the full route instead of ending above the composer.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,500}body\s*\{[\s\S]{0,500}background-image:\s*var\(--newskin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide ambient task artwork should cover the full application window.",
);
assert.match(
  css,
  /data-dream-task-mode="banner"[\s\S]{0,900}body\s*\{[\s\S]{0,500}background-image:\s*var\(--newskin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide banner task artwork should use the same full-window wallpaper contract as ambient routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main\.main-surface\.newskin-home-shell\)[\s\S]{0,100}body\s*\{[\s\S]{0,300}background-image:\s*var\(--newskin-art\) !important;/,
  "Wide home artwork should use the same full-window image as utility routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main\.main-surface\.newskin-home-shell\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide home artwork must honor the configured focal point instead of forcing a centered crop.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,260}data-dream-art-wide="true"\]:has\(main\.main-surface:not\(\.newskin-home-shell\)\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide task artwork must retain the same focal point as the home route.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]\s+\.composer-surface-chrome\s*\{[\s\S]{0,500}backdrop-filter:\s*none !important;/,
  "Wide artwork should use one uniform composer surface without a split blur layer.",
);
assert.match(
  css,
  /--ds-immersive-composer-solid:\s*rgb\(var\(--ds-panel-rgb\) \/ \.74\);/,
  "The light composer should retain enough transparency to reveal the selected artwork.",
);
assert.match(
  css,
  /data-dream-shell="light"\]\[data-dream-art-wide="true"\][\s\S]{0,100}\.composer-surface-chrome\s*\{[\s\S]{0,400}backdrop-filter:\s*blur\(8px\) saturate\(102%\) !important;/,
  "The translucent light composer should softly separate text from detailed artwork.",
);
assert.match(
  template,
  /\[class\*="_homeUtilityBar_"\][\s\S]{0,500}newskin-home-utility/,
  "The renderer should give the current native home utility bar a stable theme class.",
);
assert.match(
  css,
  /\.newskin-home:has\(\.newskin-home-utility\)[\s\S]{0,120}\.composer-surface-chrome\s*\{[\s\S]{0,180}border-radius:\s*22px !important;/,
  "The home composer must retain its own rounded border below the native project bar.",
);
assert.match(
  css,
  /\.composer-surface-chrome button:not\(\[class~="bg-token-foreground"\]\)[\s\S]{0,100}color:\s*var\(--ds-muted\) !important;/,
  "Composer controls must remain readable when Codex native tokens lag behind a forced dark appearance.",
);
assert.match(
  css,
  /\.composer-surface-chrome button:not\(\[class~="bg-token-foreground"\]\) \*\s*\{[\s\S]{0,80}color:\s*currentColor !important;/,
  "Nested labels inside composer controls must inherit the corrected theme color.",
);
assert.match(
  css,
  /home-suggestions button \[class~="text-token-text-primary"\]\s*\{[\s\S]{0,80}color:\s*var\(--ds-text\) !important;/,
  "Home suggestion labels must override native light-shell text tokens with the selected theme color.",
);
assert.match(
  css,
  /\.composer-surface-chrome p\.placeholder::after\s*\{[\s\S]{0,120}color:\s*rgb\(var\(--ds-muted-rgb\) \/ \.82\) !important;[\s\S]{0,80}opacity:\s*1 !important;/,
  "Composer placeholder text must not inherit a stale native color with double opacity.",
);
assert.match(
  css,
  /header\.app-header-tint\s*\{[\s\S]{0,180}background:\s*transparent !important;/,
  "Wide artwork should not paint a separate opaque header band.",
);
assert.match(
  css,
  /\.thread-scroll-container \.bg-gradient-to-t\.from-token-main-surface-primary\s*\{[\s\S]{0,100}background:\s*transparent !important;/,
  "Wide artwork should remove the native opaque fade behind the sticky composer.",
);
assert.match(
  css,
  /div\.sticky:has\(input\[type="text"\]\)[\s\S]{0,100}background:\s*transparent !important;/,
  "Search routes should not retain the native opaque sticky band.",
);
assert.match(
  css,
  /\[class~="bg-token-main-surface-primary"\]\[class~="h-full"\]\[class~="w-full"\][\s\S]{0,100}background:\s*transparent !important;/,
  "Full-size utility route wrappers should not hide the selected artwork.",
);
assert.match(template, /const isBlankHome[\s\S]{0,520}hasTaskEvidence/,
  "The IP layer must use a positive empty-home check and task evidence guard.");
assert.match(template, /requestThemeControl\("select-native"\)[\s\S]{0,100}cleanup/,
  "Native mode must explicitly remove the injected skin instead of merely hiding the banner.");
assert.match(template, /home\.prepend\(layer\)/,
  "The selector must attach to the native home while its absolute CSS keeps it out of layout flow.");
assert.match(template, /layer\.append\(switcher\)/,
  "The selector must mount as a compact switcher, without a banner wrapper.");
assert.doesNotMatch(template, /newskin-ip-suggestions/,
  "The renderer must not create an additional suggestion-card row.");
assert.match(css, /\.newskin-ip-layer\s*\{[\s\S]{0,160}position:\s*absolute;[\s\S]{0,100}top:\s*14px;[\s\S]{0,100}right:\s*16px;/,
  "The selector must overlay the native page instead of consuming layout height.");
assert.match(css, /\.newskin-ip-switcher\[data-theme-scrollable="true"\]\s*\{[\s\S]{0,180}width:\s*min\(512px, calc\(100vw - 32px\)\);/,
  "More than four themes must use a bounded switcher instead of a fixed empty rail.");
assert.match(css, /\.newskin-ip-controls\[data-theme-scrollable="true"\]\s*\{[\s\S]{0,620}flex:\s*1 1 0;[\s\S]{0,120}overflow-x:\s*auto;/,
  "The bounded switcher must retain a horizontal scrolling viewport for theme controls.");
assert.match(css, /data-theme-scrollable="true"\] :is\(\.newskin-ip-choice, \.newskin-ip-native\)[\s\S]{0,240}flex-basis:\s*calc\(\(100% - 23px\) \/ 4\);/,
  "The overflow viewport must show exactly four theme slots at a time.");
assert.match(css, /\[data-app-action-sidebar-thread-row\]:not\(\[aria-current="page"\]\)[\s\S]{0,160}background-color:\s*transparent !important;/,
  "Inactive native thread rows must inherit the sidebar surface instead of receiving a card fill.");
assert.match(template, /newskin-ip-scroll-button[\s\S]{0,300}显示前面的主题[\s\S]{0,260}显示后面的主题/,
  "Scrollable theme controls must expose explicit previous and next buttons.");
assert.match(template, /controls\.append\(choices\.shift\(\)\)[\s\S]{0,180}controls\.insertBefore\(choices\.pop\(\), choices\[0\]\)/,
  "Arrow paging must rotate the actual theme buttons so every click visibly changes the four-theme window.");

function createStyleDeclaration() {
  const values = new Map();
  const priorities = new Map();
  return {
    values,
    getPropertyValue(name) { return values.get(name) ?? ""; },
    getPropertyPriority(name) { return priorities.get(name) ?? ""; },
    setProperty(name, value, priority = "") {
      values.set(name, value);
      priorities.set(name, priority);
    },
    removeProperty(name) {
      values.delete(name);
      priorities.delete(name);
    },
  };
}

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    values,
    add(...names) { for (const name of names) values.add(name); },
    remove(...names) { for (const name of names) values.delete(name); },
    contains(name) { return values.has(name); },
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
  };
}

function createFixture(theme, {
  nativeShell = "light",
  analysisFixture = null,
  analysisCache = null,
  homePresent = false,
} = {}) {
  let fixtureShell = nativeShell;
  const nodes = new Map();
  const attributes = new Map();
  const bodyAttributes = new Map();
  const observers = [];
  const resizeObservers = [];
  const timers = new Map();
  let nextTimer = 1;
  let nextBlob = 1;
  const rootStyle = createStyleDeclaration();
  const root = {
    className: nativeShell === "dark" ? "electron-dark" : "electron-light",
    classList: createClassList(),
    style: rootStyle,
    appendChild(node) {
      node.parentElement = root;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };
  const body = {
    className: "",
    appendChild(node) {
      node.parentElement = body;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return bodyAttributes.get(name) ?? null; },
    setAttribute(name, value) { bodyAttributes.set(name, String(value)); },
  };
  const shellBox = { left: 280, top: 36, width: 1000, height: 764 };
  const shellMain = {
    classList: createClassList(),
    getBoundingClientRect() {
      return { ...shellBox };
    },
  };
  let taskEvidence = false;
  const homeClasses = createClassList();
  const composerEvents = [];
  const composer = {
    textContent: "",
    value: "",
    getAttribute() { return null; },
    focus() {},
    dispatchEvent(event) { composerEvents.push(event.type); return true; },
  };
  const homeAnchor = { closest() { return homeMain; } };
  const homeMain = {
    classList: homeClasses,
    children: [],
    prepend(node) {
      node.parentElement = homeMain;
      homeMain.children.unshift(node);
      if (node.id) nodes.set(node.id, node);
    },
    querySelector(selector) {
      if (selector.includes('home-icon') || selector.includes('game-source')) {
        return homePresent ? homeAnchor : null;
      }
      if (selector.includes('contenteditable') || selector.includes('textarea') || selector.includes('composer-surface-chrome')) {
        return homePresent ? composer : null;
      }
      return null;
    },
    querySelectorAll() { return []; },
  };

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
    const childNodes = new Map();
    const listeners = new Map();
    const children = [];
    const element = {
      id: "",
      dataset: {},
      style: createStyleDeclaration(),
      classList: createClassList(),
      parentElement: null,
      textContent: "",
      innerHTML: "",
      children,
      setAttribute(name, value) { element.attributes.set(name, String(value)); },
      attributes: new Map(),
      getAttribute(name) { return element.attributes.get(name) ?? null; },
      append(...items) { children.push(...items); for (const item of items) item.parentElement = element; },
      appendChild(item) { children.push(item); item.parentElement = element; return item; },
      replaceChildren(...items) { children.splice(0, children.length, ...items); for (const item of items) item.parentElement = element; },
      addEventListener(name, handler) { listeners.set(name, handler); },
      click() { listeners.get("click")?.(); },
      querySelector(selector) {
        if (!childNodes.has(selector)) childNodes.set(selector, { textContent: "" });
        return childNodes.get(selector);
      },
      remove() { if (element.id) nodes.delete(element.id); },
    };
    return element;
  };

  const document = {
    documentElement: root,
    head: root,
    body,
    createElement,
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector.includes('data-message-author-role') || selector.includes('data-testid*="message"')) {
        return taskEvidence ? {} : null;
      }
      if (selector === '[data-testid="home-icon"]') return homePresent ? homeAnchor : null;
      if (selector.includes('[role="main"].newskin-home') &&
        (selector.includes('contenteditable') || selector.includes('textarea'))) return homePresent ? composer : null;
      if (selector === "main.main-surface" || selector === "main") return shellMain;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[role="main"]') return homePresent ? [homeMain] : [];
      if (selector === '[role="main"].newskin-home') {
        return homePresent && homeClasses.contains("newskin-home") ? [homeMain] : [];
      }
      if (selector === ".newskin-home" || selector === ".newskin-home-shell" ||
        selector === ".newskin-home-utility") return [];
      return [];
    },
  };
  const mediaQuery = {
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  };
  const revokedUrls = [];
  const window = {
    addEventListener() {},
    removeEventListener() {},
    matchMedia() {
      mediaQuery.matches = fixtureShell === "dark";
      return mediaQuery;
    },
  };
  if (analysisCache) window.__CODEX_NEWSKIN_ANALYSIS_CACHE__ = analysisCache;
  if (analysisFixture) {
    window.Image = class {
      naturalWidth = analysisFixture.naturalWidth;
      naturalHeight = analysisFixture.naturalHeight;
      set src(_) { this.onload(); }
    };
  }
  const context = {
    window,
    document,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.target = null;
        resizeObservers.push(this);
      }
      observe(target) { this.target = target; }
      disconnect() { this.target = null; }
    },
    URL: {
      createObjectURL() { return `blob:fixture-${nextBlob++}`; },
      revokeObjectURL(value) { revokedUrls.push(value); },
    },
    Blob,
    Uint8Array,
    atob,
    Event: class { constructor(type) { this.type = type; } },
    InputEvent: class { constructor(type) { this.type = type; } },
    getComputedStyle() {
      const skinShell = root.classList.contains("codex-newskin")
        ? (attributes.get("data-dream-shell") || "dark") : fixtureShell;
      return {
        colorScheme: skinShell,
        backgroundColor: fixtureShell === "dark" ? "rgb(24, 24, 27)" : "rgb(250, 250, 250)",
      };
    },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    cancelAnimationFrame() {},
  };
  const payloadFor = (nextTheme, cssText = ".fixture { color: blue; }") => template
    .replace("__NEWSKIN_CSS_JSON__", JSON.stringify(cssText))
    .replace("__NEWSKIN_ART_JSON__", JSON.stringify("data:image/png;base64,AA=="))
    .replace("__NEWSKIN_THEME_JSON__", JSON.stringify(nextTheme))
    .replace("__NEWSKIN_VERSION_JSON__", JSON.stringify("test"))
    .replace("__NEWSKIN_STYLE_REVISION_JSON__", JSON.stringify(cssText))
    .replace(
      "__NEWSKIN_PAYLOAD_REVISION_JSON__",
      JSON.stringify(`${nextTheme.id}:${cssText}`),
    );
  const flushTimers = (maximumDelay = Infinity) => {
    const pending = [...timers.entries()].filter(([, timer]) => timer.delay <= maximumDelay);
    for (const [id, timer] of pending) {
      timers.delete(id);
      timer.callback();
    }
  };

  return {
    attributes,
    body,
    bodyAttributes,
    context,
    composer,
    composerEvents,
    flushTimers,
    nodes,
    observers,
    payload: payloadFor(theme),
    payloadFor,
    revokedUrls,
    resizeObservers,
    root,
    rootStyle,
    shellBox,
    timers,
    window,
    setTaskEvidence(value) { taskEvidence = value; },
    setNativeShell(value) { fixtureShell = value; },
  };
}

const defaults = createFixture({
  id: "default-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto", immersive: true },
});

const ipHome = createFixture({
  id: "ip-home",
  name: "IP Home",
  home: {
    enabled: true,
  },
  availableThemes: [{ id: "ip-home", name: "IP Home" }, { id: "saved", name: "Saved" }],
}, { homePresent: true });
vm.runInNewContext(ipHome.payload, ipHome.context);
const ipLayer = ipHome.nodes.get("codex-newskin-ip-layer");
assert.ok(ipLayer, "A configured IP layer should mount only on a verified blank home.");
const switcher = ipLayer.children[0];
const controls = switcher.children[0];
assert.equal(controls.children.length, 3, "The switcher should contain two saved themes and native mode.");
assert.equal(controls.dataset.themeCount, "3", "A short saved-theme list must retain its intrinsic compact width mode.");
assert.equal(controls.dataset.themeScrollable, "false", "Four or fewer theme controls must not reserve an empty scroll viewport.");
assert.equal(ipLayer.children.length, 1, "The switcher must not create a banner or suggestion-card row.");
controls.children[1].click();
assert.equal(ipHome.window.__CODEX_NEWSKIN_UI_CONTROL_REQUEST__.action, "select-theme");
assert.equal(ipHome.window.__CODEX_NEWSKIN_UI_CONTROL_REQUEST__.id, "saved");
controls.children[2].click();
assert.equal(ipHome.window.__CODEX_NEWSKIN_UI_CONTROL_REQUEST__.action, "select-native");
assert.equal(ipHome.nodes.has("codex-newskin-ip-layer"), false,
  "Native mode must remove the entire injected IP layer immediately.");

const ipOverflow = createFixture({
  id: "ip-overflow",
  home: { enabled: true },
  availableThemes: [
    { id: "ip-overflow", name: "Current" },
    { id: "saved-a", name: "Saved A" },
    { id: "saved-b", name: "Saved B" },
    { id: "saved-c", name: "Saved C" },
  ],
}, { homePresent: true });
vm.runInNewContext(ipOverflow.payload, ipOverflow.context);
const overflowSwitcher = ipOverflow.nodes.get("codex-newskin-ip-layer").children[0];
const overflowControls = overflowSwitcher.children[1];
assert.equal(overflowControls.dataset.themeCount, "5",
  "Native mode must count toward the four-visible-theme switcher capacity.");
assert.equal(overflowControls.dataset.themeScrollable, "true",
  "A fifth selectable theme must enable horizontal scrolling instead of widening the switcher.");
assert.equal(overflowSwitcher.children.length, 3,
  "Overflow theme controls must render previous and next paging buttons around the scroll track.");
assert.equal(overflowSwitcher.children[0].getAttribute("aria-label"), "显示前面的主题");
assert.equal(overflowSwitcher.children[2].getAttribute("aria-label"), "显示后面的主题");

const ipTask = createFixture({
  id: "ip-task",
  home: { enabled: true },
}, { homePresent: true });
vm.runInNewContext(ipTask.payload, ipTask.context);
assert.ok(ipTask.nodes.has("codex-newskin-ip-layer"));
ipTask.setTaskEvidence(true);
ipTask.window.__CODEX_NEWSKIN_STATE__.ensure();
assert.equal(ipTask.nodes.has("codex-newskin-ip-layer"), false,
  "Task evidence must remove the banner and switcher without waiting for navigation.");
const defaultResult = vm.runInNewContext(defaults.payload, defaults.context);
assert.equal(defaultResult.installed, true);
assert.equal(defaults.attributes.get("data-dream-shell"), "light");
assert.equal(defaults.attributes.get("data-dream-art-safe-area"), "center");
assert.equal(defaults.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(defaults.attributes.get("data-dream-art-ready"), "false");
assert.equal(defaults.rootStyle.values.get("--dream-art-position"), "50.00% 50.00%");
const defaultMetrics = defaults.window.__CODEX_NEWSKIN_STATE__.metrics;
assert.equal(defaultMetrics.rootPasses, 1);
assert.equal(defaultMetrics.routePasses, 1);
assert.equal(defaultMetrics.layoutReads, 1);
for (let index = 0; index < 50; index += 1) defaults.observers[0].callback([]);
assert.equal(defaults.timers.size, 1, "Mutation bursts should coalesce into one scheduled ensure.");
defaults.flushTimers(64);
assert.equal(defaultMetrics.rootPasses, 1, "Subtree mutations must not recompute root theme tokens.");
assert.equal(defaultMetrics.routePasses, 2);
assert.equal(defaultMetrics.layoutReads, 1, "Subtree mutations must not force shell layout reads.");
assert.equal(defaults.resizeObservers.length, 1);
assert.ok(defaults.resizeObservers[0].target);
defaults.shellBox.left = 196;
defaults.shellBox.width = 1084;
defaults.resizeObservers[0].callback([]);
defaults.flushTimers(64);
assert.equal(defaultMetrics.layoutReads, 2, "Shell ResizeObserver changes must refresh chrome geometry.");
const defaultChrome = defaults.nodes.get("codex-newskin-chrome");
assert.equal(defaultChrome.style.values.get("left"), "196px");
assert.equal(defaultChrome.style.values.get("width"), "1084px");

// Auto appearance must continue following the native shell after the skin is
// already installed. The fixture makes the injected root color-scheme win
// whenever our class remains on <html>, so a temporary native probe is needed
// for each light → dark → light transition.
const shellFollow = createFixture({
  id: "shell-follow",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
});
shellFollow.root.className = "";
vm.runInNewContext(shellFollow.payload, shellFollow.context);
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");
shellFollow.setNativeShell("dark");
shellFollow.window.__CODEX_NEWSKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "dark");
shellFollow.setNativeShell("light");
shellFollow.window.__CODEX_NEWSKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");

defaults.root.className = "";
defaults.body.setAttribute("data-theme", "dark");
defaults.observers[1].callback([{ type: "attributes", target: defaults.body }]);
defaults.flushTimers(64);
assert.equal(defaults.attributes.get("data-dream-shell"), "dark", "Body theme changes must apply without the fallback interval.");

const synchronousWide = createFixture({
  id: "synchronous-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto", immersive: true },
  artKey: "wide-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
});
vm.runInNewContext(synchronousWide.payload, synchronousWide.context);
assert.equal(synchronousWide.attributes.get("data-dream-art-wide"), "true");
assert.equal(synchronousWide.attributes.get("data-dream-art-aspect"), "wide");
assert.equal(synchronousWide.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(synchronousWide.attributes.get("data-dream-art-ready"), "false");

const safeCustomWide = createFixture({
  id: "safe-custom-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "off" },
  artMetadata: synchronousWide.window.__CODEX_NEWSKIN_STATE__.artMetadata,
});
vm.runInNewContext(safeCustomWide.payload, safeCustomWide.context);
assert.equal(safeCustomWide.attributes.get("data-dream-art-wide"), "false",
  "An imported wide image must not enter the global immersive layout without explicit opt-in.");
assert.equal(safeCustomWide.attributes.get("data-dream-art-aspect"), "standard");
assert.equal(safeCustomWide.attributes.get("data-dream-task-mode"), "off");

const cachedAnalysis = {
  width: 2400,
  height: 1350,
  ratio: 2400 / 1350,
  wide: true,
  aspect: "wide",
  taskMode: "ambient",
  safeArea: "left",
  focusX: 0.72,
  focusY: 0.48,
  accentRgb: { r: 180, g: 90, b: 110 },
};
const cached = createFixture({
  id: "cached-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto", immersive: true },
  artKey: "cached-art",
  artMetadata: synchronousWide.window.__CODEX_NEWSKIN_STATE__.artMetadata,
}, { analysisCache: new Map([["cached-art", cachedAnalysis]]) });
vm.runInNewContext(cached.payload, cached.context);
assert.equal(cached.attributes.get("data-dream-art-ready"), "true");
assert.equal(cached.attributes.get("data-dream-art-safe-area"), "left");
assert.equal(cached.window.__CODEX_NEWSKIN_STATE__.metrics.analysisCacheHits, 1);
assert.equal(cached.window.__CODEX_NEWSKIN_STATE__.metrics.analysisRuns, 0);

const previousWideState = synchronousWide.window.__CODEX_NEWSKIN_STATE__;
const stableStyle = synchronousWide.nodes.get("codex-newskin-style");
vm.runInNewContext(synchronousWide.payloadFor({
  id: "switched-wide",
  appearance: "dark",
  art: { safeArea: "right", taskMode: "ambient", immersive: true },
  artKey: "switched-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
}, ".fixture { color: red; }"), synchronousWide.context);
assert.equal(synchronousWide.nodes.get("codex-newskin-style"), stableStyle);
assert.equal(stableStyle.textContent, ".fixture { color: red; }");
assert.equal(stableStyle.dataset.newskinVersion, "test");
assert.equal(synchronousWide.rootStyle.values.get("--newskin-art"), 'url("blob:fixture-2")');
assert.deepEqual(synchronousWide.revokedUrls, ["blob:fixture-1"]);
assert.equal(previousWideState.cleanup(), false, "An old async cleanup must not remove the new theme.");

const brightPixels = new Uint8ClampedArray(96 * 32 * 4);
for (let offset = 0; offset < brightPixels.length; offset += 4) {
  brightPixels[offset] = 245;
  brightPixels[offset + 1] = 224;
  brightPixels[offset + 2] = 224;
  brightPixels[offset + 3] = 255;
}
const nativeDark = createFixture({
  id: "native-dark-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
}, {
  nativeShell: "dark",
  analysisFixture: { naturalWidth: 2400, naturalHeight: 800, pixels: brightPixels },
});
vm.runInNewContext(nativeDark.payload, nativeDark.context);
await Promise.resolve();
await Promise.resolve();
nativeDark.window.__CODEX_NEWSKIN_STATE__.ensure();
assert.equal(nativeDark.window.__CODEX_NEWSKIN_STATE__.analysis.shell, "light");
assert.equal(nativeDark.attributes.get("data-dream-shell"), "dark");
assert.match(nativeDark.rootStyle.values.get("--ds-bg"), /^#[0-9a-f]{6}$/);
assert.ok(Number.parseInt(nativeDark.rootStyle.values.get("--ds-bg").slice(1), 16) < 0x303030);

const explicit = createFixture({
  id: "explicit-contract",
  appearance: "dark",
  art: { focusX: 0.15, focusY: 0.8, safeArea: "none", taskMode: "off" },
});
const explicitResult = vm.runInNewContext(explicit.payload, explicit.context);
assert.equal(explicitResult.shell, "dark");
assert.equal(explicit.attributes.get("data-dream-shell"), "dark");
assert.equal(explicit.attributes.get("data-dream-art-safe-area"), "none");
assert.equal(explicit.attributes.get("data-dream-art-safe"), "none");
assert.equal(explicit.attributes.get("data-dream-art-task-mode"), "off");
assert.equal(explicit.rootStyle.values.get("--dream-art-position"), "15.00% 80.00%");
assert.equal(explicit.window.__CODEX_NEWSKIN_STATE__.analysis, null);

const banner = createFixture({
  id: "banner-contract",
  appearance: "auto",
  art: { safeArea: "left", taskMode: "banner", immersive: true },
  artMetadata: {
    width: 2560,
    height: 1440,
    ratio: 2560 / 1440,
    wide: true,
    aspect: "ultrawide",
    taskMode: "banner",
    safeArea: "left",
    focusX: 0.72,
    focusY: 0.44,
  },
});
vm.runInNewContext(banner.payload, banner.context);
assert.equal(banner.attributes.get("data-dream-art-wide"), "true");
assert.equal(banner.attributes.get("data-dream-art-task-mode"), "banner");
assert.equal(banner.attributes.get("data-dream-task-mode"), "banner");

assert.equal(explicit.window.__CODEX_NEWSKIN_STATE__.cleanup(), true);
assert.equal(explicit.root.classList.contains("codex-newskin"), false);
assert.equal(explicit.attributes.has("data-dream-shell"), false);
assert.equal(explicit.attributes.has("data-dream-art-safe-area"), false);
assert.equal(explicit.attributes.has("data-dream-art-task-mode"), false);
assert.equal(explicit.rootStyle.values.has("--dream-art-position"), false);
assert.equal(explicit.nodes.has("codex-newskin-style"), false);
assert.equal(explicit.nodes.has("codex-newskin-chrome"), false);
assert.deepEqual(explicit.revokedUrls, ["blob:fixture-1"]);
await Promise.resolve();
await Promise.resolve();
assert.equal(explicit.root.classList.contains("codex-newskin"), false);
assert.equal(explicit.nodes.has("codex-newskin-style"), false);
assert.equal(explicit.window.__CODEX_NEWSKIN_STATE__, undefined);

console.log("PASS: renderer honors adaptive art metadata, fallback, and cleanup behavior.");
