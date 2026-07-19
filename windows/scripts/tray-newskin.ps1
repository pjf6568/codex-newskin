[CmdletBinding()]
param([int]$Port = 9335)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

Assert-NewskinPort -Port $Port
$SkillRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexNewskin'
$paths = Initialize-NewskinThemeStore -SkillRoot $SkillRoot -StateRoot $StateRoot
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$startScript = Join-Path $PSScriptRoot 'start-newskin.ps1'
$restoreScript = Join-Path $PSScriptRoot 'restore-newskin.ps1'

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [System.Threading.Mutex]::new($false, "Local\CodexNewskin.$sid.Tray")
$acquired = $false
try {
  try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { exit 0 }

  $notify = [System.Windows.Forms.NotifyIcon]::new()
  $notify.Icon = [System.Drawing.SystemIcons]::Application
  $notify.Text = 'Codex Newskin'
  $notify.Visible = $true
  $menu = [System.Windows.Forms.ContextMenuStrip]::new()
  $notify.ContextMenuStrip = $menu

  function Show-NewskinTrayError {
    param([string]$Message)
    [void][System.Windows.Forms.MessageBox]::Show(
      $Message,
      'Codex Newskin',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  }

  function Start-NewskinPowerShell {
    param([Parameter(Mandatory = $true)][string]$Script, [string[]]$Arguments = @())
    $scriptToken = ConvertTo-NewskinProcessArgument -Value $Script
    $argumentLine = '-NoProfile -ExecutionPolicy RemoteSigned -File ' + $scriptToken
    if ($Arguments.Count -gt 0) { $argumentLine += ' ' + ($Arguments -join ' ') }
    Start-Process -FilePath $powershell -ArgumentList $argumentLine | Out-Null
  }

  function Add-NewskinTrayItem {
    param(
      [Parameter(Mandatory = $true)][System.Windows.Forms.ToolStripItemCollection]$Items,
      [Parameter(Mandatory = $true)][string]$Text,
      [AllowNull()][scriptblock]$Action,
      [bool]$Enabled = $true
    )
    $item = [System.Windows.Forms.ToolStripMenuItem]::new($Text)
    $item.Enabled = $Enabled
    if ($null -ne $Action) {
      $item.add_Click({
        try { & $Action } catch { Show-NewskinTrayError -Message $_.Exception.Message }
      }.GetNewClosure())
    }
    [void]$Items.Add($item)
    return $item
  }

  function Rebuild-NewskinTrayMenu {
    $menu.Items.Clear()
    $paused = Test-NewskinPaused -StateRoot $StateRoot
    $state = $null
    try { $state = Read-NewskinState -Path $paths.State } catch {}
    $active = $null
    try { $active = Read-NewskinTheme -ThemeDirectory $paths.Active -SkipImageMetadata } catch {}
    $status = if ($paused) { '状态：已暂停' } elseif ($state) { '状态：运行中' } else { '状态：未运行' }
    if ($null -ne $active -and $null -ne $active.Theme -and $active.Theme.name) {
      $status += " · $($active.Theme.name)"
    }
    $null = Add-NewskinTrayItem -Items $menu.Items -Text $status -Action $null -Enabled $false
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

    $null = Add-NewskinTrayItem -Items $menu.Items -Text '应用或重新应用' -Action {
      Set-NewskinPaused -Paused $false -StateRoot $StateRoot | Out-Null
      Start-NewskinPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
    }
    $pauseText = if ($paused) { '继续显示皮肤' } else { '暂停皮肤' }
    $nextPaused = -not $paused
    $pauseAction = {
      Set-NewskinPaused -Paused $nextPaused -StateRoot $StateRoot | Out-Null
    }.GetNewClosure()
    $null = Add-NewskinTrayItem -Items $menu.Items -Text $pauseText -Action $pauseAction
    $null = Add-NewskinTrayItem -Items $menu.Items -Text '更换背景图或视频' -Action {
      $dialog = [System.Windows.Forms.OpenFileDialog]::new()
      $dialog.Title = '选择 Codex Newskin 图片或视频背景'
      $dialog.Filter = 'Media files|*.png;*.jpg;*.jpeg;*.webp;*.mp4;*.webm;*.mov|Image files|*.png;*.jpg;*.jpeg;*.webp|Video files|*.mp4;*.webm;*.mov|All files|*.*'
      $dialog.Multiselect = $false
      try {
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          $null = Set-NewskinActiveTheme -ImagePath $dialog.FileName -Theme $null -StateRoot $StateRoot
          Set-NewskinPaused -Paused $false -StateRoot $StateRoot | Out-Null
          $notify.ShowBalloonTip(1800, 'Codex Newskin', '背景媒体已更新。', [System.Windows.Forms.ToolTipIcon]::Info)
        }
      } finally {
        $dialog.Dispose()
      }
    }
    $null = Add-NewskinTrayItem -Items $menu.Items -Text '保存当前主题' -Action {
      $name = [Microsoft.VisualBasic.Interaction]::InputBox('输入主题名称：', '保存 Codex Newskin 主题', '')
      if ($name.Trim()) {
        $saved = Save-NewskinCurrentTheme -Name $name -StateRoot $StateRoot
        $notify.ShowBalloonTip(1800, 'Codex Newskin', "已保存：$($saved.Theme.name)", [System.Windows.Forms.ToolTipIcon]::Info)
      }
    }

    $savedMenu = [System.Windows.Forms.ToolStripMenuItem]::new('已保存主题')
    $savedThemes = @(Get-NewskinSavedThemes -StateRoot $StateRoot -SkipImageMetadata)
    if ($savedThemes.Count -eq 0) {
      $empty = [System.Windows.Forms.ToolStripMenuItem]::new('暂无已保存主题')
      $empty.Enabled = $false
      [void]$savedMenu.DropDownItems.Add($empty)
    } else {
      foreach ($saved in $savedThemes) {
        $savedPath = $saved.Path
        $savedName = $saved.Name
        $savedAction = {
          $null = Use-NewskinSavedTheme -ThemeDirectory $savedPath -StateRoot $StateRoot
          Set-NewskinPaused -Paused $false -StateRoot $StateRoot | Out-Null
          $notify.ShowBalloonTip(1800, 'Codex Newskin', "已应用：$savedName", [System.Windows.Forms.ToolTipIcon]::Info)
        }.GetNewClosure()
        $null = Add-NewskinTrayItem -Items $savedMenu.DropDownItems -Text $savedName -Action $savedAction
      }
    }
    [void]$menu.Items.Add($savedMenu)

    $null = Add-NewskinTrayItem -Items $menu.Items -Text '打开图片文件夹' -Action {
      Start-Process -FilePath explorer.exe -ArgumentList @($paths.Images) | Out-Null
    }
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $null = Add-NewskinTrayItem -Items $menu.Items -Text '完全恢复 Codex' -Action {
      Start-NewskinPowerShell -Script $restoreScript -Arguments @(
        '-Port', "$Port", '-RestoreBaseTheme', '-PromptRestart'
      )
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    }
    $null = Add-NewskinTrayItem -Items $menu.Items -Text '退出托盘' -Action {
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    }
  }

  $menu.add_Opening({ Rebuild-NewskinTrayMenu })
  $notify.add_DoubleClick({
    try {
      Set-NewskinPaused -Paused $false -StateRoot $StateRoot | Out-Null
      Start-NewskinPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
    } catch {
      Show-NewskinTrayError -Message $_.Exception.Message
    }
  })
  [System.Windows.Forms.Application]::Run()
} finally {
  if ($null -ne $notify) { $notify.Dispose() }
  if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
  $mutex.Dispose()
}
