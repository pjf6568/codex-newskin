((cssText, artDataUrl, themeConfig) => {
  const STATE_KEY = "__CODEX_NEWSKIN_STATE__";
  const DISABLED_KEY = "__CODEX_NEWSKIN_DISABLED__";
  const STYLE_ID = "codex-newskin-style";
  const CHROME_ID = "codex-newskin-chrome";
  const IP_LAYER_ID = "codex-newskin-ip-layer";
  const VIDEO_ID = "codex-newskin-video";
  const VIDEO_CONTROL_ID = "codex-newskin-video-controls";
  const VIDEO_MASK_ATTR = "data-newskin-video-mask";
  const VIDEO_BLUR_PROPERTY = "--newskin-video-blur";
  const VIDEO_PANEL_OPACITY_PROPERTY = "--newskin-video-panel-opacity";
  const VIDEO_BLUR_DEFAULT = 12;
  const VIDEO_BLUR_MAX = 24;
  const VIDEO_PANEL_OPACITY_DEFAULT = 72;
  const VIDEO_PANEL_OPACITY_MIN = 0;
  const VIDEO_PANEL_OPACITY_MAX = 95;
  const SHELL_ATTR = "data-dream-shell";
  const ART_ATTRS = [
    "data-dream-art-wide", "data-dream-art-safe", "data-dream-task-mode",
    "data-dream-art-safe-area", "data-dream-art-task-mode", "data-dream-art-aspect",
    "data-dream-art-ready", "data-dream-immersive-art",
  ];
  const VERSION = __NEWSKIN_VERSION_JSON__;
  const STYLE_REVISION = __NEWSKIN_STYLE_REVISION_JSON__;
  const PAYLOAD_REVISION = __NEWSKIN_PAYLOAD_REVISION_JSON__;
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const VIDEO_THEME = THEME.mediaType === "video";
  const ART = THEME.art && typeof THEME.art === "object" ? THEME.art : {};
  const ART_METADATA = THEME.artMetadata && typeof THEME.artMetadata === "object"
    ? THEME.artMetadata : null;
  const ANALYSIS_CACHE_KEY = "__CODEX_NEWSKIN_ANALYSIS_CACHE__";
  const THEME_VARIABLES = [
    "--ds-bg", "--ds-panel", "--ds-panel-2", "--ds-green", "--ds-lime",
    "--ds-cyan", "--ds-purple", "--ds-text", "--ds-muted", "--ds-line",
    "--ds-bg-rgb", "--ds-panel-rgb", "--ds-panel-2-rgb", "--ds-accent-rgb",
    "--ds-accent-alt-rgb", "--ds-secondary-rgb", "--ds-highlight-rgb",
    "--ds-text-rgb", "--ds-muted-rgb", "--ds-line-rgb",
    "--dream-art-focus-x", "--dream-art-focus-y", "--dream-art-position",
    "--newskin-focus-x", "--newskin-focus-y", "--newskin-art-position",
    VIDEO_BLUR_PROPERTY, VIDEO_PANEL_OPACITY_PROPERTY,
    "--newskin-name", "--newskin-tagline", "--newskin-project-prefix",
    "--newskin-project-label",
  ];
  const installToken = {};
  const existingAnalysisCache = window[ANALYSIS_CACHE_KEY];
  const analysisCache = existingAnalysisCache && typeof existingAnalysisCache.get === "function" &&
    typeof existingAnalysisCache.set === "function" ? existingAnalysisCache : new Map();
  window[ANALYSIS_CACHE_KEY] = analysisCache;
  let artAnalysis = typeof THEME.artKey === "string" ? analysisCache.get(THEME.artKey) ?? null : null;
  let analysisTimer = null;
  let samplingNativeShell = false;
  let rootObserver = null;
  const TOKEN_COLOR_MARKER = "newskinTokenColor";
  const TOKEN_COLOR_ORIGINAL = "newskinTokenColorOriginal";
  const CONTRAST_COLOR_MARKER = "newskinContrastColor";
  const CONTRAST_COLOR_ORIGINAL = "newskinContrastColorOriginal";
  const TOKEN_SURFACE_MARKER = "newskinTokenSurface";
  const TOKEN_SURFACE_ORIGINAL = "newskinTokenSurfaceOriginal";
  const TOKEN_CONTROL_MARKER = "newskinTokenControl";
  const TOKEN_CONTROL_ORIGINAL = "newskinTokenControlOriginal";
  const SETTINGS_LAYOUT_MARKER = "newskinSettingsLayout";
  const SETTINGS_LAYOUT_ORIGINAL = "newskinSettingsLayoutOriginal";
  const now = () => typeof performance === "object" && typeof performance.now === "function"
    ? performance.now() : Date.now();
  const metrics = {
    ensureCalls: 0,
    rootPasses: 0,
    routePasses: 0,
    layoutReads: 0,
    attributeWrites: 0,
    styleWrites: 0,
    textWrites: 0,
    analysisRuns: 0,
    analysisCacheHits: artAnalysis ? 1 : 0,
    firstEnsureMs: null,
    analysisMs: null,
  };
  window[DISABLED_KEY] = false;

  const previous = window[STATE_KEY];
  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();

  if (previous?.observer) previous.observer.disconnect();
  if (previous?.rootObserver) previous.rootObserver.disconnect();
  if (previous?.resizeObserver) previous.resizeObserver.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(previous.scheduler.frame);
  }
  if (previous?.analysisTimer) clearTimeout(previous.analysisTimer);
  if (previous?.resizeHandler) window.removeEventListener("resize", previous.resizeHandler);
  if (previous?.mediaHandler && previous?.mediaQuery) {
    try { previous.mediaQuery.removeEventListener("change", previous.mediaHandler); } catch {}
  }
  if (previous?.videoElement) {
    try { previous.videoElement.pause(); } catch {}
    previous.videoElement.remove();
  }
  if (previous?.videoSeamFrame != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(previous.videoSeamFrame);
  }
  document.getElementById("codex-newskin-video-seam")?.remove();
  document.getElementById(VIDEO_CONTROL_ID)?.remove();

  const cssString = (value) => JSON.stringify(String(value ?? ""));

  const ensureVideoBackground = () => {
    const existing = document.getElementById(VIDEO_ID);
    if (!VIDEO_THEME) {
      if (typeof HTMLVideoElement === "function" && existing instanceof HTMLVideoElement) {
        try { existing.pause(); } catch {}
      }
      existing?.remove();
      return null;
    }
    let video = existing;
    if (typeof HTMLVideoElement !== "function" || !(video instanceof HTMLVideoElement)) {
      existing?.remove();
      video = document.createElement("video");
      video.id = VIDEO_ID;
      video.className = "newskin-video-background";
      video.setAttribute("aria-hidden", "true");
      video.setAttribute("autoplay", "");
      video.setAttribute("muted", "");
      video.setAttribute("loop", "");
      video.setAttribute("playsinline", "");
      // The video must sit behind the app, not inside main.main-surface:
      // backdrop-filter only blurs pixels behind a surface, never its own
      // descendants. main.main-surface is the adjustable video mask.
      const videoHost = document.body || document.documentElement;
      videoHost?.prepend(video);
    }
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    const videoHost = document.body || document.documentElement;
    if (video.parentElement !== videoHost) videoHost?.prepend(video);
    if (video.src !== artUrl) video.src = artUrl;
    void video.play?.().catch(() => {});
    return video;
  };

  const clampVideoBlur = (value) => {
    if (value === null || value === undefined || String(value).trim() === "") return VIDEO_BLUR_DEFAULT;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return VIDEO_BLUR_DEFAULT;
    return Math.round(Math.min(VIDEO_BLUR_MAX, Math.max(0, numeric)));
  };
  const clampVideoPanelOpacity = (value) => {
    if (value === null || value === undefined || String(value).trim() === "") return VIDEO_PANEL_OPACITY_DEFAULT;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return VIDEO_PANEL_OPACITY_DEFAULT;
    return Math.round(Math.min(VIDEO_PANEL_OPACITY_MAX, Math.max(VIDEO_PANEL_OPACITY_MIN, numeric)));
  };
  const videoBlurStorageKey = `codex-newskin:video-blur:${THEME.id || "custom"}`;
  const videoPanelOpacityStorageKey = `codex-newskin:video-panel-opacity:${THEME.id || "custom"}`;
  let videoBlur = (() => {
    try { return clampVideoBlur(window.localStorage?.getItem(videoBlurStorageKey)); } catch {}
    return VIDEO_BLUR_DEFAULT;
  })();
  let videoPanelOpacity = (() => {
    try { return clampVideoPanelOpacity(window.localStorage?.getItem(videoPanelOpacityStorageKey)); } catch {}
    return VIDEO_PANEL_OPACITY_DEFAULT;
  })();
  const setVideoBlur = (root, value, { persist = false } = {}) => {
    videoBlur = clampVideoBlur(value);
    setStyleProperty(root, VIDEO_BLUR_PROPERTY, `${videoBlur}px`);
    if (persist) {
      try { window.localStorage?.setItem(videoBlurStorageKey, String(videoBlur)); } catch {}
    }
    return videoBlur;
  };
  const setVideoPanelOpacity = (root, value, { persist = false } = {}) => {
    videoPanelOpacity = clampVideoPanelOpacity(value);
    setStyleProperty(root, VIDEO_PANEL_OPACITY_PROPERTY, `${videoPanelOpacity}%`);
    if (persist) {
      try { window.localStorage?.setItem(videoPanelOpacityStorageKey, String(videoPanelOpacity)); } catch {}
    }
    return videoPanelOpacity;
  };
  const positionVideoControls = (control) => {
    if (!control) return;
    const compact = window.innerWidth <= 720;
    const edge = compact ? 12 : 20;
    const gap = compact ? 12 : 18;
    const defaultControlsWidth = compact ? 190 : 218;
    const minimumControlsWidth = compact ? 108 : 124;
    const viewportWidth = document.documentElement?.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement?.clientHeight || window.innerHeight;
    const composer = document.querySelector(".composer-surface-chrome") ||
      document.querySelector('textarea, [contenteditable="true"]')?.closest(".composer-surface-chrome");
    let right = edge;
    let bottom = compact ? 12 : 22;
    let placement = "corner";
    if (composer && viewportWidth > 0 && viewportHeight > 0) {
      const rect = composer.getBoundingClientRect();
      const visibleComposer = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < viewportHeight;
      if (visibleComposer) {
        const rightSpace = viewportWidth - rect.right;
        if (rightSpace >= minimumControlsWidth + edge) {
          const controlsWidth = Math.min(defaultControlsWidth, Math.floor(rightSpace - edge));
          control.style.setProperty("--newskin-video-controls-width", `${controlsWidth}px`);
          right = edge;
          placement = "beside-composer";
        } else {
          control.style.removeProperty("--newskin-video-controls-width");
          bottom = Math.max(edge, Math.round(viewportHeight - rect.top + gap));
          placement = "above-composer";
        }
        try {
          resizeObserver?.observe(composer);
          resizeObserver?.observe(control);
        } catch {}
      }
    }
    if (placement === "corner") control.style.removeProperty("--newskin-video-controls-width");
    control.style.setProperty("--newskin-video-controls-right", `${right}px`);
    control.style.setProperty("--newskin-video-controls-bottom", `${bottom}px`);
    control.dataset.placement = placement;
  };
  const ensureVideoControls = (root) => {
    if (!VIDEO_THEME) {
      document.getElementById(VIDEO_CONTROL_ID)?.remove();
      if (root.style.getPropertyValue(VIDEO_BLUR_PROPERTY)) root.style.removeProperty(VIDEO_BLUR_PROPERTY);
      if (root.style.getPropertyValue(VIDEO_PANEL_OPACITY_PROPERTY)) root.style.removeProperty(VIDEO_PANEL_OPACITY_PROPERTY);
      return;
    }
    const blur = setVideoBlur(root, videoBlur);
    const opacity = setVideoPanelOpacity(root, videoPanelOpacity);
    let control = document.getElementById(VIDEO_CONTROL_ID);
    if (!control || control.parentElement !== document.body) {
      control?.remove();
      control = document.createElement("section");
      control.id = VIDEO_CONTROL_ID;
      control.className = "newskin-video-controls";
      control.setAttribute("role", "group");
      control.setAttribute("aria-label", "视频内容区蒙版控制");
      const colors = THEME.videoControls && typeof THEME.videoControls === "object" ? THEME.videoControls : {};
      for (const [name, fallback] of Object.entries({
        text: "var(--ds-text)", muted: "var(--ds-muted)", track: "rgb(var(--ds-text-rgb) / .24)",
        fill: "var(--ds-accent)", thumb: "var(--ds-panel)",
      })) {
        const value = typeof colors[name] === "string" && colors[name] ? colors[name] : fallback;
        control.style.setProperty(`--newskin-video-control-${name}`, value);
      }
      const addSlider = ({ key, label, min, max, value, unit, update }) => {
        const row = document.createElement("label");
        row.className = "newskin-video-control-row";
        row.dataset.control = key;
        const title = document.createElement("span");
        title.className = "newskin-video-controls-title";
        title.textContent = label;
        const output = document.createElement("output");
        output.className = "newskin-video-controls-value";
        const range = document.createElement("input");
        range.type = "range";
        range.min = String(min);
        range.max = String(max);
        range.step = "1";
        range.setAttribute("aria-label", `${label}强度`);
        const render = (next, persist = false) => {
          const resolved = update(next, persist);
          range.value = String(resolved);
          output.value = String(resolved);
          output.textContent = `${resolved}${unit}`;
        };
        range.addEventListener("input", () => render(range.value, true));
        row.append(title, output, range);
        control.append(row);
        render(value);
      };
      addSlider({ key: "blur", label: "内容区虚化", min: 0, max: VIDEO_BLUR_MAX, value: blur, unit: "px",
        update: (next, persist) => setVideoBlur(root, next, { persist }) });
      addSlider({ key: "opacity", label: "内容区蒙版", min: VIDEO_PANEL_OPACITY_MIN, max: VIDEO_PANEL_OPACITY_MAX,
        value: opacity, unit: "%", update: (next, persist) => setVideoPanelOpacity(root, next, { persist }) });
      document.body?.append(control);
    }
    for (const [key, value, unit] of [["blur", blur, "px"], ["opacity", opacity, "%"]]) {
      const row = control.querySelector(`[data-control="${key}"]`);
      const range = row?.querySelector('input[type="range"]');
      const output = row?.querySelector("output");
      if (range) range.value = String(value);
      if (output) { output.value = String(value); output.textContent = `${value}${unit}`; }
    }
    positionVideoControls(control);
  };

  const setStyleProperty = (root, name, value) => {
    if (root.style.getPropertyValue(name) !== value) {
      root.style.setProperty(name, value);
      metrics.styleWrites += 1;
    }
  };

  const setAttribute = (root, name, value) => {
    const normalized = String(value);
    if (root.getAttribute(name) !== normalized) {
      root.setAttribute(name, normalized);
      metrics.attributeWrites += 1;
    }
  };

  const setTextContent = (node, value) => {
    if (node && node.textContent !== value) {
      node.textContent = value;
      metrics.textWrites += 1;
    }
  };

  const parseRgb = (value) => {
    if (!value || value === "transparent") return null;
    const hex = String(value).trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const number = Number.parseInt(hex[1], 16);
      return { r: number >> 16, g: (number >> 8) & 255, b: number & 255 };
    }
    const m = String(value).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const rgbString = (value) => {
    const rgb = parseRgb(value);
    return rgb ? `${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)}` : null;
  };

  const rgbToHex = ({ r, g, b }) => `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;

  const rgbToHsl = ({ r, g, b }) => {
    const values = [r, g, b].map((value) => value / 255);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const lightness = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: lightness };
    const delta = max - min;
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue;
    if (max === values[0]) hue = (values[1] - values[2]) / delta + (values[1] < values[2] ? 6 : 0);
    else if (max === values[1]) hue = (values[2] - values[0]) / delta + 2;
    else hue = (values[0] - values[1]) / delta + 4;
    return { h: hue * 60, s: saturation, l: lightness };
  };

  const hslToRgb = ({ h, s, l }) => {
    const hue = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
      const neutral = Math.round(l * 255);
      return { r: neutral, g: neutral, b: neutral };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset) => {
      let t = hue + offset;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: channel(1 / 3) * 255, g: channel(0) * 255, b: channel(-1 / 3) * 255 };
  };

  const luminance = ({ r, g, b }) => {
    const lin = [r, g, b].map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  /** Detect Codex app light/dark shell for CSS branching. */
  const detectShellMode = () => {
    const root = document.documentElement;
    const body = document.body;
    const cls = `${root.className || ""} ${body?.className || ""}`.toLowerCase();

    if (/\b(dark|theme-dark|appearance-dark)\b/.test(cls)) return "dark";
    if (/\b(light|theme-light|appearance-light)\b/.test(cls)) return "light";

    const dataTheme = (
      root.getAttribute("data-theme") ||
      root.getAttribute("data-appearance") ||
      root.getAttribute("data-color-mode") ||
      body?.getAttribute("data-theme") ||
      body?.getAttribute("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    // Radios in profile menu (if present in DOM)
    const checked = document.querySelector('input[name="appearance-theme"]:checked');
    if (checked) {
      const label = (checked.getAttribute("aria-label") || checked.value || "").toLowerCase();
      if (label.includes("暗") || label.includes("dark")) return "dark";
      if (label.includes("浅") || label.includes("light")) return "light";
      if (label.includes("系统") || label.includes("system")) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    }

    // The skin itself declares color-scheme on :root.  Once installed,
    // reading getComputedStyle(root) directly would therefore keep `auto`
    // themes locked to the previous shell mode. Temporarily remove only our
    // own root class/attribute, sample the native computed scheme, then restore
    // synchronously. Mutation records created by this probe are drained below
    // so the root observer does not schedule a redundant ensure pass.
    try {
      const hadSkin = root.classList.contains("codex-newskin");
      const savedShell = root.getAttribute(SHELL_ATTR);
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove("codex-newskin");
      if (savedShell !== null) root.removeAttribute(SHELL_ATTR);
      let colorScheme = "";
      try {
        colorScheme = getComputedStyle(root).colorScheme || "";
      } finally {
        if (hadSkin) root.classList.add("codex-newskin");
        if (savedShell !== null) root.setAttribute(SHELL_ATTR, savedShell);
        rootObserver?.takeRecords?.();
        samplingNativeShell = false;
      }
      if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
      if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
    } catch {
      samplingNativeShell = false;
    }

    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}

    // Only use surface luminance before the skin owns those surfaces. Sampling
    // our own translucent layers would create route-dependent light/dark flips.
    if (!root.classList.contains("codex-newskin")) {
      const samples = [
        body,
        document.querySelector("main.main-surface"),
        document.querySelector("aside.app-shell-left-panel"),
      ].filter(Boolean);
      let votesLight = 0;
      let votesDark = 0;
      for (const el of samples) {
        try {
          const rgb = parseRgb(getComputedStyle(el).backgroundColor);
          if (!rgb) continue;
          const L = luminance(rgb);
          if (L >= 0.55) votesLight += 1;
          else if (L <= 0.25) votesDark += 1;
        } catch {}
      }
      if (votesLight > votesDark) return "light";
      if (votesDark > votesLight) return "dark";
    }
    return "light";
  };

  const makeAdaptivePalette = (sample, shell) => {
    const source = sample || { r: 108, g: 126, b: 136 };
    const hsl = rgbToHsl(source);
    const hue = hsl.s < 0.12 ? 214 : hsl.h;
    const saturation = clamp(hsl.s, 0.38, 0.72);
    const accent = hslToRgb({ h: hue, s: saturation, l: shell === "light" ? 0.42 : 0.66 });
    const accentAlt = hslToRgb({ h: hue + 12, s: saturation * 0.82, l: shell === "light" ? 0.52 : 0.73 });
    const secondary = hslToRgb({ h: hue - 24, s: saturation * 0.64, l: shell === "light" ? 0.56 : 0.62 });
    const highlight = hslToRgb({ h: hue + 24, s: saturation * 0.76, l: shell === "light" ? 0.36 : 0.58 });
    const neutral = (lightness, chroma = 0.08) => rgbToHex(hslToRgb({ h: hue, s: chroma, l: lightness }));
    return shell === "light" ? {
      background: neutral(0.965, 0.07),
      panel: neutral(0.987, 0.035),
      panelAlt: neutral(0.945, 0.09),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.13, 0.10),
      muted: neutral(0.42, 0.08),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .24)`,
    } : {
      background: neutral(0.055, 0.045),
      panel: neutral(0.085, 0.04),
      panelAlt: neutral(0.125, 0.05),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.93, 0.025),
      muted: neutral(0.69, 0.03),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .28)`,
    };
  };

  const resolvedShell = () => {
    if (THEME.appearance === "light" || THEME.appearance === "dark") return THEME.appearance;
    // Image luminance may tune accents and scrims, but auto appearance follows
    // Codex/ChatGPT (or the OS fallback) so a bright wallpaper cannot flip a
    // native dark session back to a light shell after analysis.
    return detectShellMode();
  };

  const applyTheme = (root, shell) => {
    const colors = THEME.colors || {};
    const explicit = new Set(Array.isArray(THEME.explicitColorKeys) ? THEME.explicitColorKeys : []);
    const adaptive = makeAdaptivePalette(artAnalysis?.accentRgb, shell);
    const legacyLight = !THEME.appearance && shell === "light";
    const structural = new Set(["background", "panel", "panelAlt", "text", "muted"]);
    const pick = (name) => {
      const allowExplicit = explicit.has(name) && !(legacyLight && structural.has(name));
      return allowExplicit && typeof colors[name] === "string" ? colors[name] : adaptive[name];
    };
    const accent = pick("accent");
    const accentAlt = explicit.has("accentAlt") ? pick("accentAlt") : (explicit.has("accent") ? accent : adaptive.accentAlt);
    const variables = {
      "--ds-bg": pick("background"),
      "--ds-panel": pick("panel"),
      "--ds-panel-2": pick("panelAlt"),
      "--ds-green": accent,
      "--ds-lime": accentAlt,
      "--ds-cyan": pick("secondary"),
      "--ds-purple": pick("highlight"),
      "--ds-text": pick("text"),
      "--ds-muted": pick("muted"),
      "--ds-line": explicit.has("line") && typeof colors.line === "string" ? colors.line : adaptive.line,
    };

    for (const [name, value] of Object.entries(variables)) {
      if (typeof value === "string" && value) setStyleProperty(root, name, value);
    }
    const rgbVariables = {
      "--ds-bg-rgb": variables["--ds-bg"],
      "--ds-panel-rgb": variables["--ds-panel"],
      "--ds-panel-2-rgb": variables["--ds-panel-2"],
      "--ds-accent-rgb": variables["--ds-green"],
      "--ds-accent-alt-rgb": variables["--ds-lime"],
      "--ds-secondary-rgb": variables["--ds-cyan"],
      "--ds-highlight-rgb": variables["--ds-purple"],
      "--ds-text-rgb": variables["--ds-text"],
      "--ds-muted-rgb": variables["--ds-muted"],
      "--ds-line-rgb": variables["--ds-line"],
    };
    for (const [name, value] of Object.entries(rgbVariables)) {
      const rgb = rgbString(value);
      if (rgb) setStyleProperty(root, name, rgb);
    }
    setStyleProperty(root, "--newskin-name", cssString(THEME.name || "Codex Newskin"));
    setStyleProperty(root, "--newskin-tagline", cssString(THEME.tagline || "Make something wonderful."));
    setStyleProperty(root, "--newskin-project-prefix", cssString(THEME.projectPrefix || "选择项目 · "));
    setStyleProperty(root, "--newskin-project-label", cssString(THEME.projectLabel || "◉  选择项目"));
  };

  // Centralized typography contract. New Codex surfaces can reuse token
  // classes without needing another page-specific color patch.
  const themeTextRoles = (root) => ({
    primary: root.style.getPropertyValue("--ds-text").trim() || "#edf0f1",
    muted: `rgb(${root.style.getPropertyValue("--ds-muted-rgb").trim() || "163 170 174"} / .92)`,
  });

  const textRoleForTokenClass = (name) => {
    // Preserve semantic code-review and status colors (added/removed/error)
    // while normal interface typography follows the active theme.
    if (/text-token-(?:green|red|yellow|orange|blue|purple|error|danger|warning|success|info|accent|link)/.test(name)) {
      return null;
    }
    return /text-token-(?:muted|description|input-placeholder|text-tertiary|text-secondary)/.test(name)
      ? "muted" : "primary";
  };

  const applyTokenTextOverrides = (root) => {
    const roles = themeTextRoles(root);
    // Tool-call editors may be mounted without a text-token class (notably
    // CodeMirror and contenteditable parameter fields). They still belong to
    // the primary text role; otherwise a native dark foreground can disappear
    // into the themed editing surface.
    const targets = document.querySelectorAll(
      '[class*="text-token-"], ' +
      ':is(input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"], .cm-editor, .cm-content, .cm-line, .CodeMirror, .CodeMirror-code), ' +
      ':is(.cm-content, .CodeMirror-code) *',
    );
    for (const node of targets) {
      if (!node?.style || !node.dataset) continue;
      const role = textRoleForTokenClass(String(node.className || ""));
      if (!role) continue;
      if (!node.dataset[TOKEN_COLOR_ORIGINAL]) {
        node.dataset[TOKEN_COLOR_ORIGINAL] = JSON.stringify([
          node.style.getPropertyValue("color"), node.style.getPropertyPriority("color"),
        ]);
      }
      const color = roles[role];
      if (node.dataset[TOKEN_COLOR_MARKER] !== color ||
        node.style.getPropertyValue("color").trim() !== color ||
        node.style.getPropertyPriority("color") !== "important") {
        node.style.setProperty("color", color, "important");
        node.dataset[TOKEN_COLOR_MARKER] = color;
      }
    }
  };

  const restoreTokenTextOverrides = () => {
    document.querySelectorAll(`[data-${TOKEN_COLOR_ORIGINAL.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}]`)
      .forEach((node) => {
        try {
          const [value, priority] = JSON.parse(node.dataset[TOKEN_COLOR_ORIGINAL]);
          if (value) node.style.setProperty("color", value, priority || "");
          else node.style.removeProperty("color");
        } catch { node.style.removeProperty("color"); }
        delete node.dataset[TOKEN_COLOR_MARKER];
        delete node.dataset[TOKEN_COLOR_ORIGINAL];
      });
  };

  const parsedRgb = (value) => {
    const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value || "");
    if (!match || (match[4] != null && Number(match[4]) <= .01)) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };

  const colorLuma = (rgb) => rgb ? rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 : 0;

  const nearestOpaqueBackground = (node) => {
    for (let candidate = node; candidate && candidate !== document.documentElement; candidate = candidate.parentElement) {
      const color = parsedRgb(getComputedStyle(candidate).backgroundColor);
      if (color) return color;
    }
    return parsedRgb(getComputedStyle(document.body).backgroundColor);
  };

  // A few transient tool-run/edit components carry no text-token class at all.
  // Repair only visibly low-contrast leaf labels, preserving intentional status
  // colors and avoiding a blanket override of the normal syntax palette.
  const applyContrastTextFallback = (root) => {
    const primary = themeTextRoles(root).primary;
    const targets = document.querySelectorAll(
      'span, p, label, code, pre, [class*="text-"], [role="status"], [aria-live], input, textarea, [contenteditable="true"], .cm-content, .CodeMirror-code',
    );
    for (const node of targets) {
      if (!node?.style || !node.dataset || node.getBoundingClientRect == null) continue;
      // Reconcile a marker left by a prior theme before judging contrast. A
      // light theme can otherwise retain old white text because it is no
      // longer a low-contrast color after an ancestor has been replaced.
      if (node.dataset[CONTRAST_COLOR_MARKER] &&
        (node.dataset[CONTRAST_COLOR_MARKER] !== primary ||
          node.style.getPropertyValue("color").trim() !== primary ||
          node.style.getPropertyPriority("color") !== "important")) {
        node.style.setProperty("color", primary, "important");
        node.dataset[CONTRAST_COLOR_MARKER] = primary;
        continue;
      }
      const text = String(node.value || node.textContent || "").trim();
      const rect = node.getBoundingClientRect();
      if (!text || rect.width < 2 || rect.height < 2 || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
      const foreground = parsedRgb(getComputedStyle(node).color);
      const background = nearestOpaqueBackground(node);
      if (!foreground || !background || Math.abs(colorLuma(foreground) - colorLuma(background)) >= 48) continue;
      if (!node.dataset[CONTRAST_COLOR_ORIGINAL]) node.dataset[CONTRAST_COLOR_ORIGINAL] = JSON.stringify([
        node.style.getPropertyValue("color"), node.style.getPropertyPriority("color"),
      ]);
      if (node.dataset[CONTRAST_COLOR_MARKER] !== primary ||
        node.style.getPropertyValue("color").trim() !== primary ||
        node.style.getPropertyPriority("color") !== "important") {
        node.style.setProperty("color", primary, "important");
        node.dataset[CONTRAST_COLOR_MARKER] = primary;
      }
    }
  };

  const restoreContrastTextFallback = () => {
    document.querySelectorAll(`[data-${CONTRAST_COLOR_ORIGINAL.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}]`)
      .forEach((node) => {
        try {
          const [value, priority] = JSON.parse(node.dataset[CONTRAST_COLOR_ORIGINAL]);
          if (value) node.style.setProperty("color", value, priority || "");
          else node.style.removeProperty("color");
        } catch { node.style.removeProperty("color"); }
        delete node.dataset[CONTRAST_COLOR_MARKER];
        delete node.dataset[CONTRAST_COLOR_ORIGINAL];
      });
  };

  // Centralized surface contract for cards, inputs, containers, and overlays.
  const themeSurfaceRoles = (root) => {
    const panelRgb = root.style.getPropertyValue("--ds-panel-rgb").trim() || "25 28 34";
    const raisedRgb = root.style.getPropertyValue("--ds-panel-2-rgb").trim() || panelRgb;
    const accentRgb = root.style.getPropertyValue("--ds-accent-rgb").trim() || "108 126 136";
    return {
      panel: `rgb(${panelRgb} / .94)`,
      raised: `rgb(${raisedRgb} / .92)`,
      input: `rgb(${panelRgb} / .78)`,
      // Sidebar items are navigation, not a stack of cards. Keep their
      // ordinary state on the sidebar surface and reserve the accent fill for
      // the current destination only.
      sidebarItem: "transparent",
      menuItem: "transparent",
      // Selection is shared by navigation, menus, and the user's own chat
      // bubble so an active state always has one visual meaning.
      selected: `rgb(${accentRgb} / .12)`,
      composerBackdrop: "transparent",
      // File-completion glyphs are a compact semantic surface, not an
      // unthemed white asset tile. Reuse the raised card layer so every
      // theme.json controls their background through panelAlt.
      fileIcon: `rgb(${raisedRgb} / .92)`,
    };
  };

  const surfaceRoleForNode = (node, name) => {
    const inSidebar = Boolean(node.closest?.("aside.app-shell-left-panel"));
    const inMenu = Boolean(node.closest?.('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'));
    const activeSidebarItem = node.matches?.('[aria-current="page"], [data-state="active"], [data-active="true"]') ||
      Boolean(node.closest?.('[aria-current="page"], [data-state="active"], [data-active="true"]'));
    const activeMenuItem = node.matches?.('[aria-current="page"], [aria-checked="true"], [data-state="active"], [data-state="checked"], [data-state="open"]') ||
      Boolean(node.closest?.('[aria-current="page"], [aria-checked="true"], [data-state="active"], [data-state="checked"]'));
    if (node.matches?.('.thread-scroll-container .bg-gradient-to-t.from-token-main-surface-primary')) return "composerBackdrop";
    if (node.matches?.('[class*="bg-token-foreground/5"][class*="rounded-2xl"]')) return "selected";
    if (node.matches?.('.thread-scroll-container [class~="bg-token-bg-secondary"]:has(svg)')) return "fileIcon";
    if (node.matches?.('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper] > *')) return "panel";
    if (inMenu && /token-list-hover-background/.test(name)) return activeMenuItem ? "selected" : "menuItem";
    if (inSidebar && node.matches?.('[role="listitem"] [class*="cursor-grab"][class*="active:cursor-grabbing"]')) {
      return "sidebarItem";
    }
    if (inSidebar && /token-(?:sidebar-surface|list-hover-background)/.test(name)) {
      return activeSidebarItem ? "selected" : "sidebarItem";
    }
    if (node.matches?.('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]')) {
      return "input";
    }
    if (/token-(?:dropdown-background|sidebar-surface|main-surface-(?:secondary|tertiary))/.test(name) ||
      (/(?:border-token-|border-\[.*token)/.test(name) && /(?:rounded|shadow)/.test(name) &&
        !node.matches?.('button, a, input, textarea, select'))) return "raised";
    return name.split(/\s+/).some((token) =>
      /^(?:(?:electron|browser):)?(?:bg|from)-token-(?:main-surface|dropdown-background|sidebar-surface|list-hover-background)/.test(token))
      ? "panel" : null;
  };

  const applyTokenSurfaceOverrides = (root) => {
    const roles = themeSurfaceRoles(root);
    const targets = document.querySelectorAll(
      // Typography has always been document-wide. Keep surfaces equally broad
      // so native app routes such as Settings receive panel/input roles too.
      '[class*="bg-token-"], [class*="from-token-"], ' +
      ':is(input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]), ' +
      '[class*="border-token-"][class*="rounded"]:not(button):not(a), ' +
      'aside.app-shell-left-panel [role="listitem"] [class*="cursor-grab"][class*="active:cursor-grabbing"], ' +
      '.thread-scroll-container [class~="bg-token-bg-secondary"]:has(svg)',
    );
    for (const node of targets) {
      if (!node?.style || !node.dataset) continue;
      const name = String(node.className || "");
      const hasSurfaceToken = name.split(/\s+/).some((token) =>
        /^(?:(?:electron|browser):)?(?:bg|from)-token-(?:main-surface|dropdown-background|sidebar-surface|list-hover-background)/.test(token));
      const role = surfaceRoleForNode(node, name);
      if (!hasSurfaceToken && !role) continue;
      if (!node.dataset[TOKEN_SURFACE_ORIGINAL]) node.dataset[TOKEN_SURFACE_ORIGINAL] = JSON.stringify([
        node.style.getPropertyValue("background-color"), node.style.getPropertyPriority("background-color"),
        node.style.getPropertyValue("background-image"), node.style.getPropertyPriority("background-image"),
        node.style.getPropertyValue("border-color"), node.style.getPropertyPriority("border-color"),
        node.style.getPropertyValue("color"), node.style.getPropertyPriority("color"),
      ]);
      const surface = roles[role || "panel"];
      const semanticBorder = role === "selected"
        ? `rgb(${root.style.getPropertyValue("--ds-accent-rgb").trim() || "108 126 136"} / .22)`
        : role === "fileIcon"
          ? `rgb(${root.style.getPropertyValue("--ds-muted-rgb").trim() || "163 170 174"} / .28)`
        : (role === "sidebarItem" || role === "menuItem" ? "transparent" : null);
      const semanticText = role === "selected"
        ? (root.style.getPropertyValue("--ds-text").trim() || "#edf0f1")
        : role === "fileIcon"
          ? (getComputedStyle(root).getPropertyValue("--ds-accent").trim() || "#6c7e88") : null;
      // Codex virtualizes and redraws sidebar/history rows after we have
      // themed them. Its renderer can replace only the inline declaration
      // while leaving our data marker in place, so the marker alone is not a
      // reliable indication that the semantic surface still owns the node.
      const currentBackground = node.style.getPropertyValue("background-color").trim();
      const currentPriority = node.style.getPropertyPriority("background-color");
      const currentBorder = node.style.getPropertyValue("border-color").trim();
      const borderPriority = node.style.getPropertyPriority("border-color");
      const currentColor = node.style.getPropertyValue("color").trim();
      const colorPriority = node.style.getPropertyPriority("color");
      if (node.dataset[TOKEN_SURFACE_MARKER] !== surface || currentBackground !== surface || currentPriority !== "important" ||
        (semanticBorder && (currentBorder !== semanticBorder || borderPriority !== "important")) ||
        (semanticText && (currentColor !== semanticText || colorPriority !== "important"))) {
        node.style.setProperty("background-color", surface, "important");
        if (semanticBorder) node.style.setProperty("border-color", semanticBorder, "important");
        if (semanticText) node.style.setProperty("color", semanticText, "important");
        if (name.includes("from-token-")) node.style.setProperty("background-image", "none", "important");
        node.dataset[TOKEN_SURFACE_MARKER] = surface;
      }
    }
  };

  const restoreTokenSurfaceOverrides = () => {
    document.querySelectorAll(`[data-${TOKEN_SURFACE_ORIGINAL.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}]`)
      .forEach((node) => {
        try {
          const [background, backgroundPriority, image, imagePriority, border, borderPriority, color, colorPriority] = JSON.parse(node.dataset[TOKEN_SURFACE_ORIGINAL]);
          if (background) node.style.setProperty("background-color", background, backgroundPriority || "");
          else node.style.removeProperty("background-color");
          if (image) node.style.setProperty("background-image", image, imagePriority || "");
          else node.style.removeProperty("background-image");
          if (border !== undefined) {
            if (border) node.style.setProperty("border-color", border, borderPriority || "");
            else node.style.removeProperty("border-color");
          }
          if (color !== undefined) {
            if (color) node.style.setProperty("color", color, colorPriority || "");
            else node.style.removeProperty("color");
          }
        } catch {
          node.style.removeProperty("background-color");
          node.style.removeProperty("background-image");
        }
        delete node.dataset[TOKEN_SURFACE_MARKER];
        delete node.dataset[TOKEN_SURFACE_ORIGINAL];
      });
  };

  // Controls use the same semantic palette as every other surface. This keeps
  // dynamically-mounted review, command, sidebar, and bottom-panel actions
  // from falling back to Codex's light native button styles.
  const themeControlRoles = (root) => {
    const panelRgb = root.style.getPropertyValue("--ds-panel-rgb").trim() || "25 28 34";
    const raisedRgb = root.style.getPropertyValue("--ds-panel-2-rgb").trim() || panelRgb;
    const accentRgb = root.style.getPropertyValue("--ds-accent-rgb").trim() || "101 190 161";
    const text = root.style.getPropertyValue("--ds-text").trim() || "#edf0f1";
    const mutedRgb = root.style.getPropertyValue("--ds-muted-rgb").trim() || "163 170 174";
    return {
      primary: {
        background: `rgb(${accentRgb} / .92)`, color: `rgb(${panelRgb})`, border: `rgb(${accentRgb} / .98)`,
      },
      secondary: {
        background: `rgb(${raisedRgb} / .92)`, color: text, border: `rgb(${mutedRgb} / .28)`,
      },
      icon: {
        background: "transparent", color: `rgb(${mutedRgb} / .96)`, border: "transparent",
      },
      menuItem: {
        background: "transparent", color: text, border: "transparent",
      },
      menuCurrent: {
        background: `rgb(${accentRgb} / .12)`, color: text, border: `rgb(${accentRgb} / .22)`,
      },
      progress: {
        background: "transparent", color: `rgb(${mutedRgb} / .82)`, border: "transparent",
      },
      navigation: {
        background: "transparent", color: text, border: "transparent",
      },
      navigationCurrent: {
        background: `rgb(${accentRgb} / .12)`, color: text, border: `rgb(${accentRgb} / .22)`,
      },
      // The four empty-home suggestions are action affordances over the
      // wallpaper, not raised secondary buttons. This role is applied as an
      // inline value because the injector themes controls inline as well.
      homeSuggestion: {
        background: "transparent", color: text, border: "transparent",
      },
    };
  };

  const controlRoleForNode = (node, name) => {
    const label = `${node.textContent || ""} ${node.getAttribute?.("aria-label") || ""}`.trim();
    // This check must run before the generic fallback below. Otherwise the
    // injector writes an inline `secondary` background with `!important`,
    // which correctly beats a stylesheet rule but incorrectly recreates the
    // pale rectangular surface on the New Task shortcuts.
    if (node.closest?.('[class~="group/home-suggestions"]')) return "homeSuggestion";
    const sidebarThreadRow = node.matches?.('[data-app-action-sidebar-thread-row]')
      ? node
      : node.querySelector?.('[data-app-action-sidebar-thread-row]');
    const sidebarNavigation = sidebarThreadRow || node.closest?.('aside.app-shell-left-panel [class*="hover:bg-token-list-hover-background"]');
    if (sidebarNavigation) {
      // DnD wraps every thread row in its own role=button cursor-grab node.
      // That wrapper has no active attribute, so derive state from its nested
      // thread row instead of incorrectly painting every row as secondary.
      const active = sidebarThreadRow
        ? sidebarThreadRow.getAttribute?.("aria-current") === "page"
        : node.matches?.('[aria-current="page"], [data-state="active"], [data-active="true"]') ||
          Boolean(node.closest?.('[aria-current="page"], [data-state="active"], [data-active="true"]'));
      return active ? "navigationCurrent" : "navigation";
    }
    // Project/task section headers belong to the sidebar hierarchy, not to
    // the raised-card family. Keep the header itself transparent; selection
    // remains exclusive to the active thread beneath it.
    if (/(?:^|\s)group\/section-toggle(?:\s|$)/.test(name)) return "navigation";
    if (/(?:^|\s)group\/navigation-row(?:\s|$)/.test(name)) return "progress";
    const inMenu = Boolean(node.closest?.('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'));
    if (inMenu) {
      return node.matches?.('[aria-current="page"], [aria-checked="true"], [data-state="active"], [data-state="checked"], [data-state="open"]')
        ? "menuCurrent" : "menuItem";
    }
    if (/bg-token-(?:foreground|accent|button-primary)|(?:^|\s)(?:primary|default)(?:\s|$)/.test(name) ||
      /^(?:审校|应用|确认|保存|继续|完成|发送)(?:\s|$)/.test(label)) return "primary";
    // Icon-only controls expose their name through aria-label, so use visible
    // text rather than the combined accessible label when selecting this role.
    if (!String(node.textContent || "").trim() && /(?:icon|aspect-square|rounded-full|size-|\bp-0\b)/.test(name)) return "icon";
    return "secondary";
  };

  const applyTokenControlOverrides = (root) => {
    const roles = themeControlRoles(root);
    const targets = document.querySelectorAll(
      // Settings is a sibling app route rather than a child of main-surface;
      // use the same semantic controls in every renderer-owned route.
      ':is(button, [role="button"], [role="menuitem"], [role="option"], [cmdk-item], [data-radix-collection-item])',
    );
    for (const node of targets) {
      if (!node?.style || !node.dataset || node.matches?.('[disabled]')) continue;
      const role = controlRoleForNode(node, String(node.className || ""));
      const control = roles[role];
      if (!control) continue;
      if (!node.dataset[TOKEN_CONTROL_ORIGINAL]) node.dataset[TOKEN_CONTROL_ORIGINAL] = JSON.stringify([
        node.style.getPropertyValue("background-color"), node.style.getPropertyPriority("background-color"),
        node.style.getPropertyValue("color"), node.style.getPropertyPriority("color"),
        node.style.getPropertyValue("border-color"), node.style.getPropertyPriority("border-color"),
      ]);
      const marker = `${role}|${control.background}|${control.color}|${control.border}`;
      // A previous injector (or a virtualized Codex row) can replace only the
      // inline colors while leaving our semantic marker behind. Compare the
      // actual declarations too, otherwise an old theme's brown/blue residue
      // survives even though the active theme.json has changed.
      const currentBackground = node.style.getPropertyValue("background-color").trim();
      const currentColor = node.style.getPropertyValue("color").trim();
      const currentBorder = node.style.getPropertyValue("border-color").trim();
      const currentPriority = [
        node.style.getPropertyPriority("background-color"),
        node.style.getPropertyPriority("color"),
        node.style.getPropertyPriority("border-color"),
      ];
      if (node.dataset[TOKEN_CONTROL_MARKER] !== marker ||
        currentBackground !== control.background || currentColor !== control.color || currentBorder !== control.border ||
        currentPriority.some((priority) => priority !== "important")) {
        node.style.setProperty("background-color", control.background, "important");
        node.style.setProperty("color", control.color, "important");
        node.style.setProperty("border-color", control.border, "important");
        node.dataset[TOKEN_CONTROL_MARKER] = marker;
      }
    }
  };

  const restoreTokenControlOverrides = () => {
    document.querySelectorAll(`[data-${TOKEN_CONTROL_ORIGINAL.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}]`)
      .forEach((node) => {
        try {
          const [background, backgroundPriority, color, colorPriority, border, borderPriority] =
            JSON.parse(node.dataset[TOKEN_CONTROL_ORIGINAL]);
          if (background) node.style.setProperty("background-color", background, backgroundPriority || "");
          else node.style.removeProperty("background-color");
          if (color) node.style.setProperty("color", color, colorPriority || "");
          else node.style.removeProperty("color");
          if (border) node.style.setProperty("border-color", border, borderPriority || "");
          else node.style.removeProperty("border-color");
        } catch {
          node.style.removeProperty("background-color");
          node.style.removeProperty("color");
          node.style.removeProperty("border-color");
        }
        delete node.dataset[TOKEN_CONTROL_MARKER];
        delete node.dataset[TOKEN_CONTROL_ORIGINAL];
      });
  };

  // Settings owns two high-level layout surfaces that do not use Codex token
  // classes: its navigation pane and the page canvas. Detect that route by
  // its stable search/back controls and assign explicit semantic roles rather
  // than relying on its native light background utilities.
  const settingsRouteIsPresent = () => Boolean(
    document.querySelector('[placeholder*="设置"], [placeholder*="settings" i], [aria-label*="设置"], [aria-label*="settings" i]') ||
    [...document.querySelectorAll('button, a, [role="button"]')].some((node) =>
      /^(?:返回应用|Back to app)$/i.test(String(node.textContent || "").trim())),
  );

  const rgbLuma = (value) => {
    const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value || "");
    return match ? (Number(match[1]) * .2126 + Number(match[2]) * .7152 + Number(match[3]) * .0722) : 0;
  };

  const setSettingsLayoutSurface = (node, role, color) => {
    if (!node?.style || !node.dataset) return;
    if (!node.dataset[SETTINGS_LAYOUT_ORIGINAL]) node.dataset[SETTINGS_LAYOUT_ORIGINAL] = JSON.stringify([
      node.style.getPropertyValue("background-color"), node.style.getPropertyPriority("background-color"),
      node.style.getPropertyValue("background-image"), node.style.getPropertyPriority("background-image"),
    ]);
    const marker = `${role}|${color}`;
    if (node.dataset[SETTINGS_LAYOUT_MARKER] !== marker) {
      node.style.setProperty("background-color", color, "important");
      node.style.setProperty("background-image", "none", "important");
      node.dataset[SETTINGS_LAYOUT_MARKER] = marker;
    }
  };

  const applySettingsLayoutFallback = (root) => {
    if (!settingsRouteIsPresent()) return;
    const viewportWidth = window.innerWidth || 1;
    const viewportHeight = window.innerHeight || 1;
    const layoutNodes = [...document.querySelectorAll('#root, #root *')]
      .map((node) => ({ node, rect: node.getBoundingClientRect?.() }))
      .filter(({ rect }) => rect && rect.width >= 160 && rect.height >= viewportHeight * .55);
    // The settings navigation pane reports a transparent computed background:
    // its visible gray comes from the native host. Identify it by layout role,
    // not brightness, so panelAlt is applied to the real full-height owner.
    const sidebar = layoutNodes
      .filter(({ rect }) => rect.left <= viewportWidth * .12 && rect.width <= viewportWidth * .34)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0];
    const candidates = layoutNodes
      .map(({ node, rect }) => ({ node, rect, color: getComputedStyle(node).backgroundColor }))
      .filter(({ rect, color }) => rect && rect.width >= 160 && rect.height >= viewportHeight * .55 &&
        rgbLuma(color) >= 120)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    const surfaces = themeSurfaceRoles(root);
    if (sidebar) setSettingsLayoutSurface(sidebar.node, "sidebar", surfaces.raised);
    const sidebarRight = sidebar?.rect.right ?? 0;
    const canvas = candidates.find(({ node, rect }) => node !== sidebar?.node &&
      rect.left >= sidebarRight - 2 && rect.width >= viewportWidth * .45);
    if (canvas) setSettingsLayoutSurface(canvas.node, "canvas", surfaces.panel);
  };

  const restoreSettingsLayoutFallback = () => {
    document.querySelectorAll(`[data-${SETTINGS_LAYOUT_ORIGINAL.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}]`)
      .forEach((node) => {
        try {
          const [background, backgroundPriority, image, imagePriority] =
            JSON.parse(node.dataset[SETTINGS_LAYOUT_ORIGINAL]);
          if (background) node.style.setProperty("background-color", background, backgroundPriority || "");
          else node.style.removeProperty("background-color");
          if (image) node.style.setProperty("background-image", image, imagePriority || "");
          else node.style.removeProperty("background-image");
        } catch {
          node.style.removeProperty("background-color");
          node.style.removeProperty("background-image");
        }
        delete node.dataset[SETTINGS_LAYOUT_MARKER];
        delete node.dataset[SETTINGS_LAYOUT_ORIGINAL];
      });
  };

  const applyArtMetadata = (root) => {
    const profile = artAnalysis || ART_METADATA;
    const inferredSafe = profile?.safeArea || "center";
    const safeArea = ART.safeArea && ART.safeArea !== "auto" ? ART.safeArea : inferredSafe;
    const canonicalSafe = ["left", "right", "center", "none"].includes(safeArea)
      ? safeArea : "center";
    const focusX = typeof ART.focusX === "number" ? ART.focusX
      : profile?.focusX ?? (safeArea === "left" ? 0.72 : safeArea === "right" ? 0.28 : 0.5);
    const focusY = typeof ART.focusY === "number" ? ART.focusY : profile?.focusY ?? 0.5;
    const taskMode = ART.taskMode && ART.taskMode !== "auto"
      ? ART.taskMode : profile?.taskMode || "ambient";
    // Wide artwork is not enough to justify changing the whole Codex layout.
    // Only audited presets can opt into that high-impact branch; imported
    // custom images retain the normal responsive shell and cannot overflow it.
    const immersive = ART.immersive === true;
    const wide = Boolean(profile?.wide) && immersive;
    const aspect = immersive ? profile?.aspect || "unknown" : "standard";
    const focusXValue = `${(clamp(focusX, 0, 1) * 100).toFixed(2)}%`;
    const focusYValue = `${(clamp(focusY, 0, 1) * 100).toFixed(2)}%`;

    setAttribute(root, "data-dream-art-wide", wide ? "true" : "false");
    setAttribute(root, "data-dream-immersive-art", immersive ? "true" : "false");
    setAttribute(root, "data-dream-art-safe", canonicalSafe);
    setAttribute(root, "data-dream-task-mode", taskMode);
    setAttribute(root, "data-dream-art-safe-area", safeArea);
    setAttribute(root, "data-dream-art-task-mode", taskMode);
    setAttribute(root, "data-dream-art-aspect", aspect);
    setAttribute(root, "data-dream-art-ready", artAnalysis ? "true" : "false");
    setStyleProperty(root, "--dream-art-focus-x", focusXValue);
    setStyleProperty(root, "--dream-art-focus-y", focusYValue);
    setStyleProperty(root, "--dream-art-position", `${focusXValue} ${focusYValue}`);
    setStyleProperty(root, "--newskin-focus-x", focusXValue);
    setStyleProperty(root, "--newskin-focus-y", focusYValue);
    setStyleProperty(root, "--newskin-art-position", `${focusXValue} ${focusYValue}`);
  };

  const analyzeArt = () => new Promise((resolve) => {
    const startedAt = now();
    metrics.analysisRuns += 1;
    if (typeof window.Image !== "function" || !document?.createElement) {
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(null);
      return;
    }
    const image = new window.Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (analysisTimer) clearTimeout(analysisTimer);
      analysisTimer = null;
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(value);
    };
    analysisTimer = setTimeout(() => finish(null), 6000);
    image.onerror = () => finish(null);
    image.onload = () => {
      try {
        const ratio = image.naturalWidth / image.naturalHeight;
        if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("Invalid image dimensions");
        const maxDimension = 96;
        const width = Math.max(16, Math.round(ratio >= 1 ? maxDimension : maxDimension * ratio));
        const height = Math.max(16, Math.round(ratio >= 1 ? maxDimension / ratio : maxDimension));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const samples = new Array(width * height);
        const bins = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
        let lightTotal = 0;
        let count = 0;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            if (data[offset + 3] < 32) continue;
            const rgb = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
            const light = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
            const hsl = rgbToHsl(rgb);
            samples[y * width + x] = { light, saturation: hsl.s };
            lightTotal += light;
            count += 1;
            if (hsl.s >= 0.16 && hsl.l >= 0.16 && hsl.l <= 0.86) {
              const bin = bins[Math.min(23, Math.floor(hsl.h / 15))];
              const weight = hsl.s * (1 - Math.abs(hsl.l - 0.52) * 0.85);
              bin.weight += weight;
              bin.r += rgb.r * weight;
              bin.g += rgb.g * weight;
              bin.b += rgb.b * weight;
            }
          }
        }
        if (!count) throw new Error("Image has no visible pixels");
        const brightness = lightTotal / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let pixels = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = samples[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              pixels += 1;
              const previous = x > start ? samples[y * width + x - 1] : null;
              const above = y > 0 ? samples[(y - 1) * width + x] : null;
              if (previous) { edges += Math.abs(sample.light - previous.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = pixels ? total / pixels : 0;
          const variance = pixels ? Math.max(0, totalSquared / pixels - mean * mean) : 1;
          return Math.sqrt(variance) * 0.58 + (edgeCount ? edges / edgeCount : 1) * 0.42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * 0.38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * 0.86) safeArea = "left";
        else if (rightInformation < leftInformation * 0.86) safeArea = "right";

        let saliencyTotal = 0;
        let saliencyX = 0;
        let saliencyY = 0;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const sample = samples[y * width + x];
            if (!sample) continue;
            const previous = x > 0 ? samples[y * width + x - 1] : null;
            const above = y > 0 ? samples[(y - 1) * width + x] : null;
            const edge = (previous ? Math.abs(sample.light - previous.light) : 0) +
              (above ? Math.abs(sample.light - above.light) : 0);
            const weight = 0.01 + Math.abs(sample.light - brightness) * 0.48 +
              sample.saturation * 0.34 + edge * 0.28;
            saliencyTotal += weight;
            saliencyX += (x + 0.5) / width * weight;
            saliencyY += (y + 0.5) / height * weight;
          }
        }
        let focusX = saliencyTotal ? saliencyX / saliencyTotal : 0.5;
        let focusY = saliencyTotal ? saliencyY / saliencyTotal : 0.5;
        if (safeArea === "left") focusX = Math.max(0.64, focusX);
        if (safeArea === "right") focusX = Math.min(0.36, focusX);
        focusX = clamp(focusX, 0.12, 0.88);
        focusY = clamp(focusY, 0.18, 0.82);

        const accentBin = bins.reduce((best, candidate) => candidate.weight > best.weight ? candidate : best, bins[0]);
        const accentRgb = accentBin.weight > 0 ? {
          r: accentBin.r / accentBin.weight,
          g: accentBin.g / accentBin.weight,
          b: accentBin.b / accentBin.weight,
        } : null;
        const aspect = ratio >= 2.25 ? "ultrawide" : ratio >= 1.45 ? "wide"
          : ratio >= 1.08 ? "landscape" : ratio >= 0.9 ? "square" : "portrait";
        finish({
          width: image.naturalWidth,
          height: image.naturalHeight,
          ratio,
          wide: ratio >= 1.75,
          aspect,
          brightness,
          shell: brightness >= 0.58 ? "light" : "dark",
          safeArea,
          focusX,
          focusY,
          taskMode: ratio >= 2.25 ? "banner" : "ambient",
          accentRgb,
        });
      } catch {
        finish(null);
      }
    };
    image.src = artUrl;
  });

  let chromeParts = null;
  let observedShellMain = null;
  let resizeObserver = null;

  const removeIpLayer = () => document.getElementById(IP_LAYER_ID)?.remove();

  const hasTaskEvidence = () => Boolean(document.querySelector(
    '[data-message-author-role], [data-testid*="message" i], [data-testid*="timeline" i], ' +
    '[data-testid*="execution" i], [data-testid*="task-title" i], article[data-message-id]',
  ));

  const isBlankHome = (home) => {
    if (!home || hasTaskEvidence()) return false;
    const hasHomeAnchor = Boolean(home.querySelector('[data-testid="home-icon"], [data-feature="game-source"]'));
    const hasComposer = Boolean(home.querySelector('[contenteditable="true"], textarea, .composer-surface-chrome'));
    return hasHomeAnchor && hasComposer;
  };

  const createIpLayer = (home) => {
    const config = THEME.home;
    if (!config?.enabled || !isBlankHome(home)) {
      removeIpLayer();
      return;
    }
    let layer = document.getElementById(IP_LAYER_ID);
    if (layer?.parentElement !== home) {
      layer?.remove();
      layer = document.createElement("section");
      layer.id = IP_LAYER_ID;
      layer.className = "newskin-ip-layer";
      layer.setAttribute("aria-label", `${THEME.name || "Codex Newskin"} 主题`);
      // This is deliberately an absolute, compact control group rather than
      // a new home-page panel: it must not consume vertical layout space.
      home.prepend(layer);
    }
    if (layer.dataset.themeRevision === PAYLOAD_REVISION) return;
    layer.replaceChildren();
    layer.dataset.themeRevision = PAYLOAD_REVISION;

    const requestThemeControl = (action, id = null) => {
      window.__CODEX_NEWSKIN_UI_CONTROL_REQUEST__ = {
        action,
        id,
        nonce: `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
      };
    };
    const switcher = document.createElement("div");
    switcher.className = "newskin-ip-switcher";
    const controls = document.createElement("div");
    controls.className = "newskin-ip-controls";
    const availableThemes = (Array.isArray(THEME.availableThemes) ? THEME.availableThemes : [])
      .filter((item) => item && typeof item.id === "string" && typeof item.name === "string")
      .slice(0, 12);
    // Native mode is a selectable theme too. Four total controls is the
    // visual capacity; additional saved themes stay available by horizontal
    // scrolling rather than widening the empty-home overlay.
    const themeControlCount = availableThemes.length + 1;
    controls.dataset.themeCount = String(themeControlCount);
    controls.dataset.themeScrollable = themeControlCount > 4 ? "true" : "false";
    switcher.dataset.themeScrollable = controls.dataset.themeScrollable;
    controls.setAttribute("aria-label", themeControlCount > 4 ? "主题选择，可横向滚动" : "主题选择");
    for (const item of availableThemes) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "newskin-ip-choice";
      choice.textContent = item.name;
      choice.disabled = item.id === THEME.id;
      choice.setAttribute("aria-pressed", item.id === THEME.id ? "true" : "false");
      choice.addEventListener("click", () => requestThemeControl("select-theme", item.id));
      controls.appendChild(choice);
    }
    const native = document.createElement("button");
    native.type = "button";
    native.className = "newskin-ip-native";
    native.textContent = "原生主题";
    native.addEventListener("click", () => {
      requestThemeControl("select-native");
      window[STATE_KEY]?.cleanup?.();
    });
    controls.append(native);
    if (themeControlCount > 4) {
      const createScrollButton = (direction, label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `newskin-ip-scroll-button newskin-ip-scroll-button-${direction}`;
        button.textContent = direction === "previous" ? "‹" : "›";
        button.setAttribute("aria-label", label);
        button.setAttribute("title", label);
        return button;
      };
      const previous = createScrollButton("previous", "显示前面的主题");
      const next = createScrollButton("next", "显示后面的主题");
      const updateScrollButtons = () => {
        // Arrow paging is a circular carousel. It must remain actionable at
        // both visual ends, unlike the optional trackpad scroll position.
        previous.disabled = false;
        next.disabled = false;
      };
      const scrollThemes = (direction) => {
        const choices = [...controls.querySelectorAll(".newskin-ip-choice, .newskin-ip-native")];
        if (choices.length <= 4) return;
        // The browser can reset scrollLeft while it lays out the injected
        // flex track. Rotate actual nodes instead: a click always reveals a
        // different four-theme window and retains each button's handler.
        if (direction > 0) controls.append(choices.shift());
        else controls.insertBefore(choices.pop(), choices[0]);
        controls.scrollLeft = 0;
        updateScrollButtons();
      };
      const bindScroll = (button, direction) => button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        scrollThemes(direction);
      });
      bindScroll(previous, -1);
      bindScroll(next, 1);
      controls.addEventListener("scroll", updateScrollButtons, { passive: true });
      switcher.append(previous, controls, next);
      layer.append(switcher);
      updateScrollButtons();
    } else {
      switcher.append(controls);
      layer.append(switcher);
    }
  };

  const ensureStyle = (root) => {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = cssText;
      style.dataset.newskinVersion = VERSION;
      (document.head || root).appendChild(style);
    } else if (style.dataset.newskinStyleRevision !== STYLE_REVISION) {
      style.textContent = cssText;
    }
    style.dataset.newskinVersion = VERSION;
    style.dataset.newskinStyleRevision = STYLE_REVISION;
    return style;
  };

  const applyRootState = (root) => {
    metrics.rootPasses += 1;
    ensureStyle(root);
    const shell = resolvedShell();
    setAttribute(root, SHELL_ATTR, shell);
    setStyleProperty(root, "--newskin-art", VIDEO_THEME ? "none" : `url("${artUrl}")`);
    applyTheme(root, shell);
    applyArtMetadata(root);
    applyTokenTextOverrides(root);
    applyTokenSurfaceOverrides(root);
    applyTokenControlOverrides(root);
    applySettingsLayoutFallback(root);
    applyContrastTextFallback(root);
    // DOMTokenList mutations notify the root observer even when the class is
    // already present in Chromium. Guarding these writes prevents the
    // observer from scheduling itself indefinitely while a long thread is
    // being virtualized during scroll.
    if (!root.classList.contains("codex-newskin")) root.classList.add("codex-newskin");
    if (root.classList.contains("newskin-video-theme") !== VIDEO_THEME) {
      root.classList.toggle("newskin-video-theme", VIDEO_THEME);
    }
    // Every video theme gets this exact layer contract. Theme JSON may choose
    // colors and control styling, but never a different mask target.
    setAttribute(root, VIDEO_MASK_ATTR, VIDEO_THEME ? "main" : "none");
    ensureVideoBackground();
    ensureVideoControls(root);
    return shell;
  };

  const syncRouteState = (shell, { layout = false } = {}) => {
    metrics.routePasses += 1;
    const root = document.documentElement;
    if (!root) return;
    applyTokenTextOverrides(root);
    applyTokenSurfaceOverrides(root);
    applyTokenControlOverrides(root);
    applySettingsLayoutFallback(root);
    applyContrastTextFallback(root);
    shell ||= root.getAttribute(SHELL_ATTR) || resolvedShell();
    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const home = homeIndicator?.closest('[role="main"]') ||
      [...document.querySelectorAll('[role="main"]')].find((candidate) =>
        candidate.querySelector('[data-feature="game-source"]') &&
        candidate.querySelector('.group\\\\/home-suggestions')) || null;
    for (const candidate of document.querySelectorAll('[role="main"].newskin-home')) {
      if (candidate !== home) candidate.classList.remove("newskin-home");
    }
    if (home) home.classList.add("newskin-home");
    createIpLayer(home);
    const homeUtilityBars = new Set(home
      ? home.querySelectorAll('[class*="_homeUtilityBar_"]')
      : []);
    for (const candidate of document.querySelectorAll(".newskin-home-utility")) {
      if (!homeUtilityBars.has(candidate)) candidate.classList.remove("newskin-home-utility");
    }
    for (const candidate of homeUtilityBars) candidate.classList.add("newskin-home-utility");

    if (!shellMain || !document.body) return;
    if (observedShellMain !== shellMain) {
      resizeObserver?.disconnect();
      resizeObserver?.observe(shellMain);
      observedShellMain = shellMain;
      layout = true;
    }
    shellMain.classList.toggle("newskin-home-shell", Boolean(home));
    let chrome = document.getElementById(CHROME_ID);
    let created = false;
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML = `
        <div class="newskin-brand">
          <span class="newskin-portal-mark">◉</span>
          <span><b></b><small></small></span>
        </div>
        <div class="newskin-status"><i></i><span></span></div>
        <div class="newskin-quote"></div>
        <div class="newskin-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="newskin-orbit"></div>`;
      document.body.appendChild(chrome);
      created = true;
      chromeParts = null;
    }
    if (!chromeParts || chromeParts.chrome !== chrome) {
      chromeParts = {
        chrome,
        name: chrome.querySelector(".newskin-brand b"),
        subtitle: chrome.querySelector(".newskin-brand small"),
        status: chrome.querySelector(".newskin-status span"),
        quote: chrome.querySelector(".newskin-quote"),
      };
    }
    setTextContent(chromeParts.name, THEME.name || "Codex Newskin");
    setTextContent(chromeParts.subtitle, THEME.brandSubtitle || "CODEX NEWSKIN");
    setTextContent(chromeParts.status, THEME.statusText || "NEWSKIN ONLINE");
    setTextContent(chromeParts.quote, THEME.quote || "MAKE SOMETHING WONDERFUL");
    if (layout || created) {
      metrics.layoutReads += 1;
      const shellBox = shellMain.getBoundingClientRect();
      setStyleProperty(chrome, "left", `${Math.round(shellBox.left)}px`);
      setStyleProperty(chrome, "top", `${Math.round(shellBox.top)}px`);
      setStyleProperty(chrome, "width", `${Math.round(shellBox.width)}px`);
      setStyleProperty(chrome, "height", `${Math.round(shellBox.height)}px`);
    }
    chrome.classList.toggle("newskin-home-shell", Boolean(home));
    if (chrome.dataset.dreamShell !== shell) {
      chrome.dataset.dreamShell = shell;
      metrics.attributeWrites += 1;
    }
  };

  const ensure = ({ root: rootPass = true, route = true, layout = true } = {}) => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
    metrics.ensureCalls += 1;
    const shell = rootPass ? applyRootState(root) : null;
    if (route) syncRouteState(shell, { layout });
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window[DISABLED_KEY] = true;
    document.documentElement?.classList.remove("codex-newskin", "newskin-video-theme");
    document.documentElement?.removeAttribute(SHELL_ATTR);
    document.documentElement?.removeAttribute(VIDEO_MASK_ATTR);
    for (const name of ART_ATTRS) document.documentElement?.removeAttribute(name);
    document.documentElement?.style.removeProperty("--newskin-art");
    for (const name of THEME_VARIABLES) document.documentElement?.style.removeProperty(name);
    document.querySelectorAll(".newskin-home").forEach((node) => node.classList.remove("newskin-home"));
    document.querySelectorAll(".newskin-home-shell").forEach((node) => node.classList.remove("newskin-home-shell"));
    document.querySelectorAll(".newskin-home-utility").forEach((node) => node.classList.remove("newskin-home-utility"));
    removeIpLayer();
    restoreTokenTextOverrides();
    restoreContrastTextFallback();
    restoreTokenSurfaceOverrides();
    restoreTokenControlOverrides();
    restoreSettingsLayoutFallback();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(VIDEO_CONTROL_ID)?.remove();
    const video = document.getElementById(VIDEO_ID);
    if (typeof HTMLVideoElement === "function" && video instanceof HTMLVideoElement) {
      try { video.pause(); } catch {}
    }
    video?.remove();
    state?.observer?.disconnect();
    state?.rootObserver?.disconnect();
    state?.resizeObserver?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.scheduler.frame);
    }
    if (analysisTimer) clearTimeout(analysisTimer);
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null, frame: null, root: false, route: false, layout: false };
  const flushScheduledEnsure = () => {
    if (scheduler.frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(scheduler.frame);
    }
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.frame = null;
    scheduler.timeout = null;
    const pending = { root: scheduler.root, route: scheduler.route, layout: scheduler.layout };
    scheduler.root = false;
    scheduler.route = false;
    scheduler.layout = false;
    ensure(pending);
  };
  const scheduleEnsure = ({ root = false, route = true, layout = false } = {}) => {
    scheduler.root ||= root;
    scheduler.route ||= route;
    scheduler.layout ||= layout;
    if (scheduler.timeout || scheduler.frame !== null) return;
    if (typeof requestAnimationFrame === "function") {
      scheduler.frame = requestAnimationFrame(flushScheduledEnsure);
      scheduler.timeout = setTimeout(flushScheduledEnsure, 96);
    } else {
      scheduler.timeout = setTimeout(flushScheduledEnsure, 64);
    }
  };
  const observer = new MutationObserver(() => scheduleEnsure({ route: true }));
  rootObserver = new MutationObserver(() => {
    if (samplingNativeShell) return;
    scheduleEnsure({ root: true, route: true });
  });
  const resizeHandler = () => scheduleEnsure({ route: true, layout: true });
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => scheduleEnsure({ route: true, layout: true }));
  }

  let mediaQuery = null;
  let mediaHandler = null;
  try {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaHandler = () => scheduleEnsure({ root: true, route: true });
  } catch {}

  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    rootObserver,
    resizeObserver,
    timer: null,
    scheduler,
    resizeHandler,
    mediaQuery,
    mediaHandler,
    artUrl,
    videoElement: VIDEO_THEME ? document.getElementById(VIDEO_ID) : null,
    videoTheme: VIDEO_THEME,
    installToken,
    analysis: artAnalysis,
    artMetadata: ART_METADATA,
    metrics,
    version: VERSION,
    themeId: THEME.id || "custom",
    revision: PAYLOAD_REVISION,
    detectShellMode,
  };
  const firstEnsureStartedAt = now();
  ensure({ layout: !previous || !document.getElementById(CHROME_ID) });
  metrics.firstEnsureMs = Number((now() - firstEnsureStartedAt).toFixed(3));
  if (previous?.artUrl && previous.artUrl !== artUrl) URL.revokeObjectURL(previous.artUrl);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  rootObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode", "style"],
  });
  if (document.body) {
    rootObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode", "style"],
    });
  }
  const timer = setInterval(() => ensure(), 4000);
  window[STATE_KEY].timer = timer;
  window.addEventListener("resize", resizeHandler, { passive: true });
  if (mediaHandler && mediaQuery) {
    mediaQuery.addEventListener("change", mediaHandler);
  }
  const analysisPromise = artAnalysis ? Promise.resolve(null) : analyzeArt();
  window[STATE_KEY].analysisTimer = analysisTimer;
  analysisPromise.then((analysis) => {
    const state = window[STATE_KEY];
    if (!analysis || state?.installToken !== installToken || window[DISABLED_KEY]) return;
    artAnalysis = analysis;
    state.analysis = analysis;
    if (typeof THEME.artKey === "string") {
      analysisCache.set(THEME.artKey, analysis);
      while (analysisCache.size > 8) analysisCache.delete(analysisCache.keys().next().value);
    }
    ensure({ root: true, route: false, layout: false });
  }).catch(() => {});
  return {
    installed: true,
    version: VERSION,
    themeId: THEME.id || "custom",
    revision: PAYLOAD_REVISION,
    shell: resolvedShell(),
    analysis: artAnalysis,
  };
})(__NEWSKIN_CSS_JSON__, __NEWSKIN_ART_JSON__, __NEWSKIN_THEME_JSON__)
