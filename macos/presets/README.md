# 预设主题 · Preset packs

这是 **macOS 的生成发布副本**，不是主题源。唯一可编辑的主题包、背景媒体和跨平台注册表在 [`../../themes/`](../../themes/README.md)。安装时 `install-newskin-macos.sh` 会把每个 `preset-*/` 幂等地播种到用户主题库 `~/Library/Application Support/CodexNewskinStudio/themes/`，装完即可在**菜单栏「已保存的主题」**或 `switch-theme-macos.sh --id <id>` 里直接切换。

> This folder is a generated macOS delivery copy. Edit [`themes/`](../../themes/README.md), then regenerate platform packs before installing.

## 内置实测预设

当前内置 `preset-gothic-void-crusade/`（Gothic Void Crusade）、
`preset-arina-hashimoto/`（桥本有菜 / Arina Hashimoto）、
`preset-daqiao-yimeng/`（大乔·遗梦）、`preset-sakura-garden/`（樱庭绮梦）、
`preset-crimson-night/`（绯夜兔语）、`preset-shrine-lantern/`（神社灯火）、
`preset-tidal-silk/`（海风霓裳）和 `preset-yangyue/`（仰月）八套实机验证主题。
其中「仰月」使用 `background.mp4` 作为静音循环背景；其余预设使用纯背景图片。所有预设都会在安装时播种到本地主题库。

来源尺寸必须如实区分：不随 preset 播种的归档用户源图已按主题名整理在 [`../../themes/source-art/`](../../themes/source-art/)。发布主题与平台映射则由 [`../../themes/registry.json`](../../themes/registry.json) 统一记录。preset 内的 `background.jpg` 均标准化导出为 `2560 × 1440` JPEG；对非 16:9 源图会做不拉伸的居中裁切，不代表补回或新增源图细节。

- 可导入/可播种的主题素材只有 [`background.jpg`](./preset-arina-hashimoto/background.jpg) 与 [`theme.json`](./preset-arina-hashimoto/theme.json)。
- 当前浅色、暗色实测文档截图均为 `2308 × 1572` Retina JPEG（CSS viewport `1154 × 786`），来自同一真实 Codex 首页；为保护未发送草稿，截图时仅用临时本地样式隐藏输入文字并收起编辑区，没有修改草稿内容或伪造皮肤效果。它们包含真实侧栏、项目工具栏和输入框，**只作预览，绝不能当背景导入**。
- 背景是用户提供的 AI 生成示例，不代表 OpenAI/Codex 官方视觉或背书；公开分发前仍需确认人物、模型输出与素材使用权。
- 该维护者提供的精选预设是单独记录的发行例外，不纳入 MIT 软件许可；文件清单和限制见 [`../NOTICE.md`](../NOTICE.md)。这不表示以后可以提交其他可识别真人素材。

安装后可直接切换：

```bash
~/.codex/codex-newskin/scripts/switch-theme-macos.sh \
  --id preset-arina-hashimoto
```

## 一套预设的结构

```
preset-<slug>/
├── theme.json        # schemaVersion 2；image 与 mediaType 的唯一运行时引用
└── background.jpg    # 图片主题；视频主题则使用 background.mp4
```

- 目录名与 `theme.json` 的 `id` **必须**都是 `preset-<slug>` 形式（`slug` 用小写英文 + 连字符）。播种只管理 `preset-*`，绝不会碰用户自己「换一张图」保存的 `custom-*` 主题。
- `image` 字段只能是**本目录内**的文件名（不能是路径）。图片支持 `png` / `jpg` / `jpeg` / `webp`，≤ 16 MB；视频主题通过 `mediaType: "video"` 使用 `mp4` / `webm` / `mov`，≤ 32 MB。
- 人物/场景背景优先提交 `2560 × 1440`（16:9）母版；主视觉放在右侧约 58%～88%，左侧约 50%～58% 保持低信息、低对比。禁止把效果截图、窗口 mockup 或任何带 UI 的图片命名为 `background.*`。

## 素材红线（务必阅读）

内置预设会随仓库分发，**不是**「个人本地示意」。为避免把维护者和使用者拖进法律风险，只接受：

- ✅ **原创**或你**拥有授权**的图像；
- ✅ 明确 **CC0 / 公有领域 / 允许再分发**的素材；
- ✅ 纯程序化生成的抽象 / 渐变 / 几何背景。
- ✅ 原创虚构的成年人物形象，且能说明生成/授权来源、没有模仿可识别真人。

除非维护者事先完成独立权利审核并在 `NOTICE.md` 逐项记录，否则**不接受**（PR 会被拒绝）：

- ❌ 真人肖像（明星、网红、AV 演员等）——涉肖像权，且本仓库带 MIT 与商业赞助；
- ❌ 受版权保护的动漫 / 游戏 / 影视角色与截图；
- ❌ 任何你无权再分发的第三方素材。

提交预设即视为你声明：对该素材拥有分发与再授权的权利。

## 贡献方式

没有 mac 或想用自制原图，也可以直接在 [`../../themes/`](../../themes/README.md) 新建 `preset-<slug>/background.jpg` + `theme.json`（照抄任一现有预设改配色即可）。

生成纯背景时，请使用本页给出的 16:9 尺寸、安全区域和禁止带 UI/文字的约束；完成后在浅色和暗色 Codex 界面中分别验收。

## 提交前自检

```bash
# 单独校验一套预设是否是合法可注入的主题包
node macos/scripts/injector.mjs --check-payload --theme-dir themes/preset-<slug>/

# 同步并校验全部平台打包副本
node tools/sync-theme-catalog.mjs --write
node tools/sync-theme-catalog.mjs

# 跑完整测试（含预设合法性 + 播种幂等）
cd macos && npm test
```

`theme.json` 字段含义见 [`../../themes/templates/base-newskin/theme.json`](../../themes/templates/base-newskin/theme.json) 与 `scripts/write-theme.mjs`；`colors` 十个键请与背景图协调（`accent` / `secondary` / `highlight` 会体现在原生控件的强调色上）。
