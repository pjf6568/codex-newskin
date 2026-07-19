((cssText, artDataUrl, rawConfig) => {
  const STATE_KEY = "__CODEX_NEWSKIN_STATE__";
  const STYLE_ID = "codex-newskin-style";
  const CHROME_ID = "codex-newskin-chrome";
  const IP_LAYER_ID = "codex-newskin-ip-layer";
  const VIDEO_ID = "codex-newskin-video";
  const VIDEO_CONTROL_ID = "codex-newskin-video-controls";
  const VIDEO_BLUR_PROPERTY = "--newskin-video-blur";
  const VIDEO_PANEL_OPACITY_PROPERTY = "--newskin-video-panel-opacity";
  const VIDEO_BLUR_DEFAULT = 12;
  const VIDEO_BLUR_MAX = 24;
  const VIDEO_PANEL_OPACITY_DEFAULT = 72;
  const VIDEO_PANEL_OPACITY_MIN = 0;
  const VIDEO_PANEL_OPACITY_MAX = 95;
  const ROOT_CLASSES = [
    "codex-newskin",
    "dream-theme-light",
    "dream-theme-dark",
    "dream-art-wide",
    "dream-art-standard",
    "dream-focus-left",
    "dream-focus-center",
    "dream-focus-right",
    "dream-safe-left",
    "dream-safe-center",
    "dream-safe-right",
    "dream-safe-none",
    "dream-task-ambient",
    "dream-task-banner",
    "dream-task-off",
  ];
  const ROOT_PROPERTIES = [
    "--dream-art",
    "--dream-art-position",
    "--dream-focus-x",
    "--dream-focus-y",
    "--dream-accent",
    "--dream-accent-ink",
    "--dream-image-luma",
    VIDEO_BLUR_PROPERTY, VIDEO_PANEL_OPACITY_PROPERTY,
  ];
  const HOME_UTILITY_CLASS = "dream-home-utility";
  const installToken = {};
  let samplingNativeShell = false;
  let observer = null;
  const videoTheme = rawConfig?.mediaType === "video";
  window.__CODEX_NEWSKIN_DISABLED__ = false;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));
  const luminance = (red, green, blue) => {
    const linear = [red, green, blue].map((value) => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const defaultProfile = {
    appearance: "dark",
    accent: [108, 131, 142],
    focusX: .5,
    focusY: .5,
    aspect: 1.6,
    luma: .32,
    safeArea: "center",
  };

  const normalizeConfig = (value) => {
    const config = value && typeof value === "object" ? value : {};
    const art = config.art && typeof config.art === "object" ? config.art : {};
    const hasNumber = (candidate) =>
      (typeof candidate === "number" || (typeof candidate === "string" && candidate.trim() !== "")) &&
      Number.isFinite(Number(candidate));
    const requestedAccent = typeof config?.palette?.accent === "string"
      ? config.palette.accent.trim()
      : "";
    const safeAccent = /^(?:#[\da-f]{3,8}|(?:rgb|hsl|oklch|oklab)\([^;{}]{1,96}\))$/i.test(requestedAccent)
      ? requestedAccent
      : null;
    const appearance = ["auto", "light", "dark"].includes(config.appearance)
      ? config.appearance
      : "auto";
    const safeArea = ["auto", "left", "right", "center", "none"].includes(art.safeArea)
      ? art.safeArea
      : "auto";
    const taskMode = ["auto", "ambient", "banner", "off"].includes(art.taskMode)
      ? art.taskMode
      : "auto";
    const metadataRatio = Number(config?.artMetadata?.ratio);
    const rawVideoControls = config.videoControls && typeof config.videoControls === "object"
      && !Array.isArray(config.videoControls) ? config.videoControls : {};
    const controlColor = (value, fallback) => typeof value === "string" &&
      /^(?:#[\da-f]{3,8}|rgba?\([0-9., %]+\))$/i.test(value.trim()) ? value.trim() : fallback;
    return {
      appearance,
      safeArea,
      taskMode,
      focusX: hasNumber(art.focusX) ? clamp(art.focusX) : null,
      focusY: hasNumber(art.focusY) ? clamp(art.focusY) : null,
      accent: safeAccent,
      initialAspect: Number.isFinite(metadataRatio) && metadataRatio > 0 ? metadataRatio : null,
      videoControls: {
        text: controlColor(rawVideoControls.text, "var(--dream-text)"),
        muted: controlColor(rawVideoControls.muted, "var(--dream-muted)"),
        track: controlColor(rawVideoControls.track, "rgba(237, 245, 248, .28)"),
        fill: controlColor(rawVideoControls.fill, "var(--dream-accent)"),
        thumb: controlColor(rawVideoControls.thumb, "var(--dream-surface)"),
      },
    };
  };

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.videoElement) {
    try { previous.videoElement.pause(); } catch {}
    previous.videoElement.remove();
  }
  document.getElementById(VIDEO_CONTROL_ID)?.remove();
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);
  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();
  const config = normalizeConfig(rawConfig);
  const ensureVideoBackground = () => {
    const existing = document.getElementById(VIDEO_ID);
    if (!videoTheme) {
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
      const videoHost = document.querySelector("main.main-surface") || document.body;
      videoHost?.prepend(video);
    }
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    const videoHost = document.querySelector("main.main-surface") || document.body;
    if (videoHost && video.parentElement !== videoHost) videoHost.prepend(video);
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
  const videoBlurStorageKey = `codex-newskin:video-blur:${rawConfig?.id || "custom"}`;
  const videoPanelOpacityStorageKey = `codex-newskin:video-panel-opacity:${rawConfig?.id || "custom"}`;
  let videoBlur = (() => {
    try { return clampVideoBlur(window.localStorage?.getItem(videoBlurStorageKey)); } catch {}
    return VIDEO_BLUR_DEFAULT;
  })();
  let videoPanelOpacity = (() => {
    try { return clampVideoPanelOpacity(window.localStorage?.getItem(videoPanelOpacityStorageKey)); } catch {}
    return VIDEO_PANEL_OPACITY_DEFAULT;
  })();
  const setVideoBlur = (root, value, persist = false) => {
    videoBlur = clampVideoBlur(value);
    if (root.style?.getPropertyValue?.(VIDEO_BLUR_PROPERTY) !== `${videoBlur}px`) {
      root.style?.setProperty?.(VIDEO_BLUR_PROPERTY, `${videoBlur}px`);
    }
    if (persist) {
      try { window.localStorage?.setItem(videoBlurStorageKey, String(videoBlur)); } catch {}
    }
    return videoBlur;
  };
  const setVideoPanelOpacity = (root, value, persist = false) => {
    videoPanelOpacity = clampVideoPanelOpacity(value);
    if (root.style?.getPropertyValue?.(VIDEO_PANEL_OPACITY_PROPERTY) !== `${videoPanelOpacity}%`) {
      root.style?.setProperty?.(VIDEO_PANEL_OPACITY_PROPERTY, `${videoPanelOpacity}%`);
    }
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
    const viewportWidth = document.documentElement?.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement?.clientHeight || window.innerHeight;
    const composer = document.querySelector(".composer-surface-chrome") ||
      document.querySelector('textarea, [contenteditable="true"]')?.closest(".composer-surface-chrome");
    let right = edge;
    let bottom = compact ? 12 : 22;
    let placement = "corner";
    if (composer && viewportWidth > 0 && viewportHeight > 0) {
      const rect = composer.getBoundingClientRect();
      const controlsWidth = control.getBoundingClientRect().width || (compact ? 190 : 218);
      const visibleComposer = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < viewportHeight;
      if (visibleComposer) {
        const rightSpace = viewportWidth - rect.right;
        if (rightSpace >= controlsWidth + gap * 2) {
          right = Math.max(edge, Math.round(rightSpace - controlsWidth - gap));
          placement = "beside-composer";
        } else {
          bottom = Math.max(edge, Math.round(viewportHeight - rect.top + gap));
          placement = "above-composer";
        }
      }
    }
    control.style.setProperty("--newskin-video-controls-right", `${right}px`);
    control.style.setProperty("--newskin-video-controls-bottom", `${bottom}px`);
    control.dataset.placement = placement;
  };
  const ensureVideoControls = (root) => {
    if (!videoTheme) {
      document.getElementById(VIDEO_CONTROL_ID)?.remove();
      if (root.style?.getPropertyValue?.(VIDEO_BLUR_PROPERTY)) root.style?.removeProperty?.(VIDEO_BLUR_PROPERTY);
      if (root.style?.getPropertyValue?.(VIDEO_PANEL_OPACITY_PROPERTY)) root.style?.removeProperty?.(VIDEO_PANEL_OPACITY_PROPERTY);
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
      control.setAttribute("aria-label", "视频背景控制");
      for (const [name, value] of Object.entries(config.videoControls)) {
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
      addSlider({ key: "blur", label: "背景虚化", min: 0, max: VIDEO_BLUR_MAX, value: blur, unit: "px",
        update: (next, persist) => setVideoBlur(root, next, persist) });
      addSlider({ key: "opacity", label: "面板不透明度", min: VIDEO_PANEL_OPACITY_MIN, max: VIDEO_PANEL_OPACITY_MAX,
        value: opacity, unit: "%", update: (next, persist) => setVideoPanelOpacity(root, next, persist) });
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
  let profile = {
    ...defaultProfile,
    aspect: config.initialAspect ?? defaultProfile.aspect,
  };
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamVersion = "3";
  }

  const analyzeArt = () => new Promise((resolve) => {
    if (typeof Image !== "function") {
      resolve(defaultProfile);
      return;
    }
    const image = new Image();
    image.onload = () => {
      try {
        const width = 48;
        const height = Math.max(12, Math.round(width * image.naturalHeight / image.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        let count = 0;
        let totalRed = 0;
        let totalGreen = 0;
        let totalBlue = 0;
        let totalBrightness = 0;
        const samples = [];
        const sampleMap = new Array(width * height);
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] < 96) continue;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const light = (.2126 * red + .7152 * green + .0722 * blue) / 255;
          const sample = { red, green, blue, light, index: offset / 4 };
          samples.push(sample);
          sampleMap[sample.index] = sample;
          totalRed += red;
          totalGreen += green;
          totalBlue += blue;
          totalBrightness += light;
          count += 1;
        }
        if (!count) throw new Error("Image contains no opaque pixels");
        const average = [totalRed / count, totalGreen / count, totalBlue / count];
        const averageBrightness = totalBrightness / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let sampleCount = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = sampleMap[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              sampleCount += 1;
              const previousSample = x > start ? sampleMap[y * width + x - 1] : null;
              const above = y > 0 ? sampleMap[(y - 1) * width + x] : null;
              if (previousSample) { edges += Math.abs(sample.light - previousSample.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = sampleCount ? total / sampleCount : 0;
          const variance = sampleCount ? Math.max(0, totalSquared / sampleCount - mean * mean) : 1;
          return Math.sqrt(variance) * .58 + (edgeCount ? edges / edgeCount : 1) * .42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * .38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * .86) safeArea = "left";
        else if (rightInformation < leftInformation * .86) safeArea = "right";
        let focusWeight = 0;
        let focusX = 0;
        let focusY = 0;
        let accentWeight = 0;
        let accent = [0, 0, 0];
        for (const sample of samples) {
          const x = sample.index % width;
          const y = Math.floor(sample.index / width);
          const difference = Math.sqrt(
            (sample.red - average[0]) ** 2 +
            (sample.green - average[1]) ** 2 +
            (sample.blue - average[2]) ** 2,
          ) / 441.7;
          const saliency = .03 + difference ** 1.35;
          focusX += (x / Math.max(1, width - 1)) * saliency;
          focusY += (y / Math.max(1, height - 1)) * saliency;
          focusWeight += saliency;
          const max = Math.max(sample.red, sample.green, sample.blue);
          const min = Math.min(sample.red, sample.green, sample.blue);
          const saturation = max ? (max - min) / max : 0;
          const usableLight = 1 - Math.min(1, Math.abs(sample.light - .46) / .54);
          const weight = saturation ** 2 * (.15 + usableLight);
          accent[0] += sample.red * weight;
          accent[1] += sample.green * weight;
          accent[2] += sample.blue * weight;
          accentWeight += weight;
        }
        const resolvedAccent = accentWeight > 1
          ? accent.map((channel) => Math.round(channel / accentWeight))
          : average.map((channel) => Math.round(channel));
        let resolvedFocusX = clamp(focusX / focusWeight);
        if (safeArea === "left") resolvedFocusX = Math.max(.64, resolvedFocusX);
        if (safeArea === "right") resolvedFocusX = Math.min(.36, resolvedFocusX);
        resolve({
          appearance: averageBrightness >= .58 ? "light" : "dark",
          accent: resolvedAccent,
          focusX: resolvedFocusX,
          focusY: clamp(focusY / focusWeight),
          aspect: image.naturalWidth / Math.max(1, image.naturalHeight),
          luma: clamp(averageBrightness),
          safeArea,
        });
      } catch {
        resolve(defaultProfile);
      }
    };
    image.onerror = () => resolve(defaultProfile);
    image.src = artUrl;
  });

  const detectShellAppearance = () => {
    const root = document.documentElement;
    const body = document.body;
    const classes = `${root?.className || ""} ${body?.className || ""}`
      .toLowerCase()
      .replace(/\bdream-theme-(?:dark|light)\b/g, "");
    if (/\b(dark|electron-dark|theme-dark|appearance-dark)\b/.test(classes)) return "dark";
    if (/\b(light|electron-light|theme-light|appearance-light)\b/.test(classes)) return "light";

    const dataTheme = (
      root?.getAttribute?.("data-theme") ||
      root?.getAttribute?.("data-appearance") ||
      root?.getAttribute?.("data-color-mode") ||
      body?.getAttribute?.("data-theme") ||
      body?.getAttribute?.("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    try {
      const hadSkin = root?.classList?.contains?.("codex-newskin");
      const savedSkinClasses = hadSkin
        ? ROOT_CLASSES.filter((className) => root.classList.contains(className))
        : [];
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove(...ROOT_CLASSES);
      try {
        const colorScheme = getComputedStyle(root).colorScheme || "";
        if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
        if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
      } finally {
        if (hadSkin) root.classList.add(...savedSkinClasses);
        observer?.takeRecords?.();
        samplingNativeShell = false;
      }
    } catch {
      samplingNativeShell = false;
    }
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}
    return "light";
  };

  const clearSkinDom = () => {
    const root = document.documentElement;
    root?.classList.remove(...ROOT_CLASSES, "newskin-video-theme");
    for (const property of ROOT_PROPERTIES) root?.style.removeProperty(property);
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-task").forEach((node) => node.classList.remove("dream-task"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.querySelectorAll(`.${HOME_UTILITY_CLASS}`).forEach((node) => node.classList.remove(HOME_UTILITY_CLASS));
    document.getElementById(IP_LAYER_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(VIDEO_CONTROL_ID)?.remove();
    const video = document.getElementById(VIDEO_ID);
    if (typeof HTMLVideoElement === "function" && video instanceof HTMLVideoElement) {
      try { video.pause(); } catch {}
    }
    video?.remove();
  };

  const applyProfile = (root) => {
    const focusX = config.focusX ?? profile.focusX;
    const focusY = config.focusY ?? profile.focusY;
    const appearance = config.appearance === "auto" ? detectShellAppearance() : config.appearance;
    const focus = focusX < .4 ? "left" : focusX > .6 ? "right" : "center";
    const safeArea = config.safeArea === "auto" ? (profile.safeArea ||
      (focus === "left" ? "right" : focus === "right" ? "left" : "center")) : config.safeArea;
    const taskMode = config.taskMode === "auto"
      ? profile.aspect >= 2.25 ? "banner" : "ambient"
      : config.taskMode;
    const accent = config.accent || `rgb(${profile.accent.join(" ")})`;
    const accentInk = luminance(...profile.accent) > .42 ? "rgb(26 24 28)" : "rgb(250 248 251)";
    root.classList.toggle("dream-theme-light", appearance === "light");
    root.classList.toggle("dream-theme-dark", appearance === "dark");
    root.classList.toggle("dream-art-wide", profile.aspect >= 1.75);
    root.classList.toggle("dream-art-standard", profile.aspect < 1.75);
    for (const value of ["left", "center", "right"]) {
      root.classList.toggle(`dream-focus-${value}`, focus === value);
    }
    for (const value of ["left", "center", "right", "none"]) {
      root.classList.toggle(`dream-safe-${value}`, safeArea === value);
    }
    for (const value of ["ambient", "banner", "off"]) {
      root.classList.toggle(`dream-task-${value}`, taskMode === value);
    }
    root.style.setProperty("--dream-art", videoTheme ? "none" : `url("${artUrl}")`);
    root.style.setProperty("--dream-art-position", `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`);
    root.style.setProperty("--dream-focus-x", String(focusX));
    root.style.setProperty("--dream-focus-y", String(focusY));
    root.style.setProperty("--dream-accent", accent);
    root.style.setProperty("--dream-accent-ink", accentInk);
    root.style.setProperty("--dream-image-luma", profile.luma.toFixed(3));
  };

  const removeIpLayer = () => document.getElementById(IP_LAYER_ID)?.remove();
  const hasTaskEvidence = () => Boolean(document.querySelector(
    '[data-message-author-role], [data-testid*="message" i], [data-testid*="timeline" i], ' +
    '[data-testid*="execution" i], [data-testid*="task-title" i], article[data-message-id]',
  ));
  const isBlankHome = (home) => {
    if (!home || hasTaskEvidence()) return false;
    return Boolean(home.querySelector('[data-testid="home-icon"], [data-feature="game-source"]')) &&
      Boolean(home.querySelector('[contenteditable="true"], textarea, .composer-surface-chrome'));
  };
  const createIpLayer = (home) => {
    const homeConfig = rawConfig?.home;
    if (!homeConfig?.enabled || !isBlankHome(home)) {
      removeIpLayer();
      return;
    }
    let layer = document.getElementById(IP_LAYER_ID);
    if (layer?.parentElement !== home) {
      layer?.remove();
      layer = document.createElement("section");
      layer.id = IP_LAYER_ID;
      layer.className = "newskin-ip-layer";
      layer.setAttribute("aria-label", `${rawConfig?.name || "Codex Newskin"} 主题`);
      home.prepend(layer);
    }
    const revision = JSON.stringify(homeConfig);
    if (layer.dataset.themeRevision === revision) return;
    layer.replaceChildren();
    layer.dataset.themeRevision = revision;
    const requestThemeControl = (action, id = null) => {
      window.__CODEX_NEWSKIN_UI_CONTROL_REQUEST__ = {
        action,
        id,
        nonce: `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
      };
    };
    const controls = document.createElement("div");
    controls.className = "newskin-ip-controls";
    const availableThemes = Array.isArray(rawConfig?.availableThemes) ? rawConfig.availableThemes.slice(0, 12) : [];
    for (const item of availableThemes) {
      if (!item || typeof item.id !== "string" || typeof item.name !== "string") continue;
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "newskin-ip-choice";
      choice.textContent = item.name;
      choice.disabled = item.id === rawConfig?.id;
      choice.setAttribute("aria-pressed", item.id === rawConfig?.id ? "true" : "false");
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
    layer.append(controls);
  };

  const ensure = () => {
    if (window.__CODEX_NEWSKIN_DISABLED__) return;
    const root = document.documentElement;
    if (!root || !document.body) return;

    const shellMain = document.querySelector("main.main-surface");
    const shellSidebar = document.querySelector("aside.app-shell-left-panel");
    if (!shellMain || !shellSidebar) {
      clearSkinDom();
      return;
    }

    // DOMTokenList mutations notify the root observer even when the class is
    // already present in Chromium. Avoid a self-scheduling observer loop
    // while long conversation threads are virtualized during scroll.
    if (!root.classList.contains("codex-newskin")) root.classList.add("codex-newskin");
    if (root.classList.contains("newskin-video-theme") !== videoTheme) {
      root.classList.toggle("newskin-video-theme", videoTheme);
    }
    ensureVideoBackground();
    ensureVideoControls(root);
    applyProfile(root);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamVersion !== "3") {
      style.textContent = cssText;
      style.dataset.dreamVersion = "3";
    }

    const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    for (const candidate of document.querySelectorAll('[role="main"]')) {
      candidate.classList.toggle("dream-home", candidate === home);
      candidate.classList.toggle("dream-task", candidate !== home);
    }
    const utilityBars = new Set(home ? home.querySelectorAll('[class*="_homeUtilityBar_"]') : []);
    for (const candidate of document.querySelectorAll(`.${HOME_UTILITY_CLASS}`)) {
      if (!utilityBars.has(candidate)) candidate.classList.remove(HOME_UTILITY_CLASS);
    }
    for (const candidate of utilityBars) candidate.classList.add(HOME_UTILITY_CLASS);
    shellMain.classList.toggle("dream-home-shell", Boolean(home));
    createIpLayer(home);

    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      document.body.appendChild(chrome);
    }
    chrome.classList.toggle("dream-home-shell", Boolean(home));
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window.__CODEX_NEWSKIN_DISABLED__ = true;
    clearSkinDom();
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  observer = new MutationObserver(() => {
    if (samplingNativeShell) return;
    scheduleEnsure();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode"],
  });
  const timer = setInterval(ensure, 5000);
  window[STATE_KEY] = {
    ensure, cleanup, observer, timer, scheduler, artUrl, profile, config, installToken,
    videoElement: videoTheme ? document.getElementById(VIDEO_ID) : null, videoTheme, version: "1.2.0",
  };
  ensure();
  analyzeArt().then((result) => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken || window.__CODEX_NEWSKIN_DISABLED__) return;
    profile = result;
    state.profile = result;
    ensure();
  });
  return { installed: true, version: "1.2.0", adaptive: true };
})(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __DREAM_THEME_JSON__)
