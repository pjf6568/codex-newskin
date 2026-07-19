[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$NoShortcuts
)

$ErrorActionPreference = 'Stop'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$SkillRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$operationLock = Enter-NewskinOperationLock
try {
  Assert-NewskinPort -Port $Port
  $null = Get-NewskinNodeRuntime
  $registeredInstalls = @(Get-NewskinRegisteredCodexInstalls)
  if ($registeredInstalls.Count -eq 0) {
    throw 'The official OpenAI.Codex Store package is not installed or its identity cannot be validated.'
  }
  foreach ($registeredCodex in $registeredInstalls) {
    if ((Get-NewskinCodexProcesses -Codex $registeredCodex).Count -gt 0) {
      throw 'Close Codex before installing Newskin so config.toml cannot change during the transaction.'
    }
  }

  $StateRoot = Join-Path $env:LOCALAPPDATA 'CodexNewskin'
  $themePaths = Get-NewskinThemePaths -StateRoot $StateRoot
  Ensure-NewskinManagedDirectory -Path $themePaths.Root -Root $themePaths.Root
  $StatePath = Join-Path $StateRoot 'state.json'
  $existingState = Read-NewskinState -Path $StatePath
  $savedPathCandidate = Get-NewskinCodexStatePathCandidate -State $existingState
  $savedCodex = Resolve-NewskinCodexInstallFromState -State $existingState -RegisteredInstalls $registeredInstalls
  if ($null -ne $savedPathCandidate -and $null -eq $savedCodex -and
    (Get-NewskinCodexProcesses -Codex $savedPathCandidate).Count -gt 0) {
    throw 'The saved Codex path is still running but no longer matches a registered Store package. Close it manually before installing.'
  }
  if (Test-NewskinTrayActive) {
    throw 'Exit the Codex Newskin tray before reinstalling so every shortcut can move to the new runtime safely.'
  }
  $engine = Install-NewskinRuntimeEngine -SkillRoot $SkillRoot -StateRoot $StateRoot
  $null = Initialize-NewskinThemeStore -SkillRoot $engine.Root -StateRoot $StateRoot
  $ConfigPath = Join-Path $HOME '.codex\config.toml'
  $BackupPath = Join-Path $StateRoot 'config.before-newskin.toml'
  Install-NewskinBaseTheme -ConfigPath $ConfigPath -BackupPath $BackupPath

  if (-not $NoShortcuts) {
    $shell = New-Object -ComObject WScript.Shell
    $desktop = [Environment]::GetFolderPath('Desktop')
    $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
    $startScript = $engine.Start
    $restoreScript = $engine.Restore
    $trayScript = $engine.Tray
    $portArgument = if ($PortExplicit) { " -Port $Port" } else { '' }

    foreach ($folder in @($desktop, $startMenu)) {
      $shortcut = $shell.CreateShortcut((Join-Path $folder 'Codex Newskin.lnk'))
      $shortcut.TargetPath = $powershell
      $shortcut.Arguments = "-NoProfile -ExecutionPolicy RemoteSigned -File `"$startScript`"$portArgument -PromptRestart"
      $shortcut.WorkingDirectory = $engine.Root
      $shortcut.Description = 'Launch the official Codex app with Codex Newskin'
      $shortcut.Save()
    }

    $restore = $shell.CreateShortcut((Join-Path $desktop 'Codex Newskin - Restore.lnk'))
    $restore.TargetPath = $powershell
    $restore.Arguments = "-NoProfile -ExecutionPolicy RemoteSigned -File `"$restoreScript`"$portArgument -RestoreBaseTheme -PromptRestart"
    $restore.WorkingDirectory = $engine.Root
    $restore.Description = 'Restore the official Codex appearance and close the CDP session'
    $restore.Save()

    foreach ($folder in @($desktop, $startMenu)) {
      $tray = $shell.CreateShortcut((Join-Path $folder 'Codex Newskin - Tray.lnk'))
      $tray.TargetPath = $powershell
      $tray.Arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$trayScript`"$portArgument"
      $tray.WorkingDirectory = $engine.Root
      $tray.Description = 'Open Codex Newskin status and theme controls in the system tray'
      $tray.Save()
    }
    Start-Process -FilePath $powershell -ArgumentList `
      "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$trayScript`"$portArgument" `
      -WindowStyle Hidden | Out-Null
  }

  if ($NoShortcuts) {
    Write-Host "Codex Newskin base theme installed at $($engine.Root). Run $($engine.Start) to launch it."
  } else {
    Write-Host 'Codex Newskin installed. The launch shortcut asks before restarting an open Codex window.'
  }
} finally {
  Exit-NewskinOperationLock -Mutex $operationLock
}
