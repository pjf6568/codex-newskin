# Codex Newskin for Windows

<p align="center">
  <strong>中文</strong> · <a href="./README.en.md">English</a>
</p>

Codex Newskin 通过本机回环 CDP 给官方 Codex Windows 桌面应用加载外部主题。它保留原生侧栏、项目选择、任务内容和输入框，不修改 WindowsApps、`app.asar` 或应用签名。

## 运行要求

- 从 Microsoft Store 安装且已注册到当前用户的官方 `OpenAI.Codex` 应用。
- Node.js 22 或更高版本，`node.exe` 可从 `PATH` 找到。
- Windows PowerShell 5.1 或更高版本。

安装脚本需要在 Codex 完全退出后运行。普通使用不需要管理员权限，也不需要接管 WindowsApps 目录。

## 安装

在 PowerShell 中进入仓库的 `windows` 目录，然后运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-newskin.ps1
```

安装器会校验官方 Codex Store 包和 Node.js，保存可恢复的外观配置，并初始化本地主题仓库。默认还会创建这些快捷方式：

- `Codex Newskin`：启动或重新应用皮肤。
- `Codex Newskin - Tray`：打开系统托盘主题控制。
- `Codex Newskin - Restore`：恢复官方外观并关闭已保存的 CDP 会话。

主题仓库会直接播种 **桥本有菜、樱庭绮梦、绯夜兔语、神社灯火、海风霓裳** 五套内置主题；它们会同时出现在托盘的「已保存主题」和首页主题轮换控件中，且不会覆盖当前主题。所有内置主题的配置和背景媒体只在仓库根目录 [`../themes/`](../themes/README.md) 维护，Windows 下的 `assets/presets/` 是自动生成的发布副本。

安装命令中的 `Bypass` 只作用于这一次由用户明确发起的安装进程。安装器会先校验运行时副本的 SHA-256，再仅对 `%LOCALAPPDATA%\CodexNewskin\engine` 中受管的 PowerShell 副本清除下载区标记。日常快捷方式使用 `RemoteSigned`，不会绕过系统或企业组策略。

如需使用自定义端口，可以在安装时传入 `-Port`。端口范围必须是 `1024` 到 `65535`。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-newskin.ps1 -Port 9444
```

## 更新

先退出 Newskin 托盘并关闭 Codex，再更新仓库（`git pull`，或重新下载最新源码），然后重新运行上面的安装命令。安装器会原子替换受管运行时并重建快捷方式；当前主题、已保存主题和导入图片不会被删除。

## 启动与验证

推荐从 `Codex Newskin` 快捷方式启动。它发现 Codex 已经运行时会先询问是否重启。

命令行启动：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-newskin.ps1 -PromptRestart
```

启动后运行验证脚本：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-newskin.ps1 `
  -ScreenshotPath "$env:TEMP\codex-newskin.png"
```

验证脚本会自动确认：

- CDP 端点只绑定本机回环地址，并且属于当前官方 Codex 包。
- 当前渲染页已经加载预期版本的皮肤。
- 原生侧栏和输入框仍然存在。
- 皮肤装饰层不会拦截鼠标事件。
- 当前为首页时，首页主题结构已经正确加载。

随后用生成的截图检查横向溢出和文字对比度，再分别在首页与普通任务页手动检查项目菜单和输入框交互。完整视觉检查项见 [`references/qa-inventory.md`](./references/qa-inventory.md)。

## 更换和保存主题

打开 `Codex Newskin - Tray` 后可以：

- 更换 PNG、JPEG、WebP 图片，或不超过 32 MB 的 MP4、WebM、MOV 视频背景。视频始终静音循环播放；推荐 MP4（H.264）或 WebM。
- 保存当前主题并从「已保存主题」切换。
- 安装或更新后，内置主题会自动加入首页主题轮换，无需逐张导入。
- 暂停或继续显示皮肤。
- 重新应用主题，或完整恢复 Codex。

导入图片必须是纯背景，不要使用包含窗口、侧栏、输入框、文字或按钮的效果截图。图片上限为 16 MB；宽或高不能超过 16384 像素，总像素不能超过 5000 万。视频上限为 32 MB，并会以静音循环方式作为不可交互的背景层。

## 恢复与卸载快捷方式

恢复官方外观；如果 Codex 正在运行，确认后关闭并重新打开：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-newskin.ps1 `
  -RestoreBaseTheme -PromptRestart
```

如需同时删除 Newskin 创建的快捷方式，再增加 `-Uninstall`：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-newskin.ps1 `
  -RestoreBaseTheme -PromptRestart -Uninstall
```

`-RecoverConfigBackup` 用于明确恢复安装前的完整 `config.toml` 备份。它会先保存当前配置，只应在配置损坏且普通的 `-RestoreBaseTheme` 无法解决时使用。

## 文件与日志位置

| 用途 | 路径 |
|------|------|
| Newskin 状态根目录 | `%LOCALAPPDATA%\CodexNewskin` |
| 当前主题 | `%LOCALAPPDATA%\CodexNewskin\active-theme` |
| 已保存主题 | `%LOCALAPPDATA%\CodexNewskin\themes` |
| 导入图片归档 | `%LOCALAPPDATA%\CodexNewskin\images` |
| 会话状态 | `%LOCALAPPDATA%\CodexNewskin\state.json` |
| 注入器日志 | `%LOCALAPPDATA%\CodexNewskin\injector.log` |
| 注入器错误日志 | `%LOCALAPPDATA%\CodexNewskin\injector-error.log` |
| 验证日志 | `%LOCALAPPDATA%\CodexNewskin\verify.log` |
| Codex 配置 | `%USERPROFILE%\.codex\config.toml` |

上述路径均位于当前用户目录；不要将状态目录或配置文件提交到仓库。

## 常见问题

### 找不到 Node.js

运行 `node --version`，确认版本为 22 或更高，并重新打开 PowerShell 让新的 `PATH` 生效。

### 找不到官方 Codex 包

运行：

```powershell
Get-AppxPackage -Name OpenAI.Codex
```

脚本只接受已注册的官方 Store 包，不会从任意可执行文件路径启动 Codex。

### 安装器要求关闭 Codex

关闭所有 Codex 窗口后再运行安装器。安装期间必须保持配置和应用状态稳定。

### 杀毒软件报告旧版托盘快捷方式

旧版托盘快捷方式同时使用隐藏 PowerShell 和 `ExecutionPolicy Bypass`，可能触发基于行为特征的 LNK 告警。不要直接加入白名单；更新源码并重新运行安装器，让快捷方式改用 `RemoteSigned`。如果新版仍然报警，请保留隔离状态，并在 Issue 中附上杀毒软件名称、版本、告警名称和快捷方式属性，不要上传密钥或私人数据。

### 端口被占用

没有显式指定 `-Port` 时，启动脚本会从默认端口 `9335` 开始寻找空闲端口。显式端口被其他进程占用时，改用另一个端口，不要关闭身份不明的监听进程。

### 验证找不到 CDP 端点

通过 `Codex Newskin` 快捷方式启动 Codex，再运行验证脚本。普通 Codex 启动方式不会打开 Newskin 所需的调试会话。

### Codex 更新后皮肤失效

重新运行安装器和启动快捷方式。脚本会重新发现当前注册的 Store 包，不依赖旧版本的可执行文件路径。

提交问题时请从仓库的 [Issue 提交页](https://github.com/pjf6568/codex-newskin/issues/new/choose) 选择 Bug 模板，附上系统版本、Codex 来源、复现步骤和相关日志片段。请删除密钥、`auth.json`、中转 token 和私人对话内容。

## 安全边界

- CDP 只绑定 `127.0.0.1`。皮肤运行期间不要运行来路不明的本机程序。
- 不修改官方 Codex 安装目录、WindowsApps、`app.asar` 或签名。
- 不写入 API Key、Base URL 或模型供应商配置。
- 恢复脚本只会控制经过包身份、进程路径和会话状态校验的 Codex 进程。

维护者和代理使用的实现约束见 [`SKILL.md`](./SKILL.md)，运行时排错细节见 [`references/runtime-notes.md`](./references/runtime-notes.md)。
