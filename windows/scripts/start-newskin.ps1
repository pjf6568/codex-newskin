[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$RestartExisting,
  [switch]$PromptRestart,
  [string]$ProfilePath,
  [switch]$ForegroundInjector
)

$ErrorActionPreference = 'Stop'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$Injector = Join-Path $PSScriptRoot 'injector.mjs'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$operationLock = Enter-NewskinOperationLock
try {
  Assert-NewskinPort -Port $Port
  if ($ProfilePath) { $ProfilePath = [System.IO.Path]::GetFullPath($ProfilePath) }
  $node = Get-NewskinNodeRuntime
  $currentCodex = Get-NewskinCodexInstall
  $codex = $currentCodex
  $StateRoot = Join-Path $env:LOCALAPPDATA 'CodexNewskin'
  $themePaths = Get-NewskinThemePaths -StateRoot $StateRoot
  Ensure-NewskinManagedDirectory -Path $themePaths.Root -Root $themePaths.Root
  $StatePath = Join-Path $StateRoot 'state.json'
  $StdoutPath = Join-Path $StateRoot 'injector.log'
  $StderrPath = Join-Path $StateRoot 'injector-error.log'
  $VerifyPath = Join-Path $StateRoot 'verify.log'
  $themePaths = Initialize-NewskinThemeStore -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
  $pauseWasSet = Test-NewskinPaused -StateRoot $StateRoot

  $previousState = Read-NewskinState -Path $StatePath
  if (-not $PortExplicit -and $null -ne $previousState -and $previousState.port) {
    $savedPort = [int]$previousState.port
    Assert-NewskinPort -Port $savedPort
    $Port = $savedPort
  }
  $savedPathCandidate = Get-NewskinCodexStatePathCandidate -State $previousState
  $savedCodex = Get-NewskinCodexInstallFromState -State $previousState
  $candidateMatchesCurrent = [bool]($null -ne $savedPathCandidate -and
    (Test-NewskinPathEqual -Left $savedPathCandidate.PackageRoot -Right $currentCodex.PackageRoot) -and
    (Test-NewskinPathEqual -Left $savedPathCandidate.Executable -Right $currentCodex.Executable))
  if ($null -ne $savedPathCandidate -and $null -eq $savedCodex -and -not $candidateMatchesCurrent) {
    $unverifiedSavedRunning = (Get-NewskinCodexProcesses -Codex $savedPathCandidate).Count -gt 0
    $unverifiedSavedOwnsPort = Test-NewskinCodexPortOwner -Port $Port -Codex $savedPathCandidate
    if ($unverifiedSavedRunning -or $unverifiedSavedOwnsPort) {
      throw 'The saved Codex path is still active but no longer matches a registered OpenAI.Codex package. Close it manually; state was preserved.'
    }
  }

  $currentProcesses = Get-NewskinCodexProcesses -Codex $currentCodex
  $codexToStop = $currentCodex
  $cdpIdentity = Get-NewskinVerifiedCdpIdentity -Port $Port -Codex $currentCodex
  $savedIsDifferent = [bool]($null -ne $savedCodex -and
    -not (Test-NewskinPathEqual -Left $savedCodex.Executable -Right $currentCodex.Executable))
  if ($savedIsDifferent) {
    $savedProcesses = Get-NewskinCodexProcesses -Codex $savedCodex
    $savedOwnsPort = Test-NewskinCodexPortOwner -Port $Port -Codex $savedCodex
    if ($currentProcesses.Count -gt 0 -and ($savedProcesses.Count -gt 0 -or $savedOwnsPort)) {
      throw 'Multiple registered Codex package versions are active. Close them manually before starting Newskin.'
    }
    if ($savedProcesses.Count -gt 0 -or $savedOwnsPort) {
      if ($savedOwnsPort -and $savedProcesses.Count -eq 0) {
        throw 'The saved Codex listener is active but its process cannot be managed safely; state was preserved.'
      }
      $savedIdentity = Get-NewskinVerifiedCdpIdentity -Port $Port -Codex $savedCodex
      if ($null -ne $savedIdentity) {
        $codex = $savedCodex
        $codexToStop = $savedCodex
        $cdpIdentity = $savedIdentity
        Write-Warning 'Reapplying Newskin to the still-running registered Codex version; the current Store version will be used after that app exits.'
      } else {
        $codexToStop = $savedCodex
        $currentProcesses = $savedProcesses
      }
    }
  }
  $debugReady = $null -ne $cdpIdentity
  $codexProcesses = if (Test-NewskinPathEqual -Left $codexToStop.Executable -Right $currentCodex.Executable) {
    $currentProcesses
  } else {
    Get-NewskinCodexProcesses -Codex $codexToStop
  }
  $closedExistingCodex = $false
  if (-not $debugReady -and $codexProcesses.Count -gt 0) {
    $restartAuthorized = [bool]$RestartExisting
    if (-not $restartAuthorized -and $PromptRestart) {
      $restartAuthorized = Confirm-NewskinRestart -Message 'Codex must restart once to enable Newskin. Unsaved input may be lost. Restart now?'
      if (-not $restartAuthorized) {
        Write-Host 'Newskin launch was cancelled; Codex was not changed.'
        exit 0
      }
    }
    if (-not $restartAuthorized) {
      throw 'Codex is open without a verified Newskin CDP endpoint. Close it first or explicitly use -RestartExisting.'
    }
    Stop-NewskinCodex -Codex $codexToStop -AllowForce
    $closedExistingCodex = $true
    $codex = $currentCodex
  }

  $launchedWithCdp = $false
  try {
    if ($null -eq (Get-NewskinVerifiedCdpIdentity -Port $Port -Codex $codex)) {
      if (-not (Test-NewskinPortAvailable -Port $Port)) {
        if ($PortExplicit) { throw "Port $Port is already occupied by an unverified listener. Choose another port." }
        $Port = Select-NewskinPort -PreferredPort $Port
      }
      $arguments = @('--remote-debugging-address=127.0.0.1', "--remote-debugging-port=$Port")
      if ($ProfilePath) {
        New-Item -ItemType Directory -Force -Path $ProfilePath | Out-Null
        $arguments += "--user-data-dir=$ProfilePath"
      }
      $null = Start-NewskinCodex -Codex $codex -Arguments $arguments
      $launchedWithCdp = $true
    }

    $deadline = (Get-Date).AddSeconds(45)
    $cdpIdentity = Get-NewskinVerifiedCdpIdentity -Port $Port -Codex $codex
    while ($null -eq $cdpIdentity) {
      if ((Get-Date) -ge $deadline) {
        throw "Codex did not expose a verified loopback CDP endpoint on port $Port within 45 seconds."
      }
      Start-Sleep -Milliseconds 400
      $cdpIdentity = Get-NewskinVerifiedCdpIdentity -Port $Port -Codex $codex
    }
  } catch {
    $launchError = $_
    if ($launchedWithCdp) {
      try { Stop-NewskinCodex -Codex $codex -AllowForce } catch {
        Write-Warning 'Launch rollback could not fully close the failed CDP session.'
      }
    }
    if (($closedExistingCodex -or $launchedWithCdp) -and
      (Get-NewskinCodexProcesses -Codex $codex).Count -eq 0) {
      if ($launchedWithCdp) {
        Write-Warning 'Newskin launch failed; reopening Codex without a debugging port.'
      }
      try { $null = Start-NewskinCodex -Codex $codex } catch {
        Write-Warning 'Launch rollback could not reopen Codex automatically.'
      }
    }
    throw $launchError
  }

  try {
    $recordedInjectorStopped = Stop-NewskinRecordedInjector -State $previousState
    if (-not $recordedInjectorStopped) {
      $staleStatePath = Archive-NewskinStateFile -Path $StatePath
      Write-Warning "Archived stale Newskin state at $staleStatePath"
    }
  } catch {
    if ($launchedWithCdp) {
      try {
        Stop-NewskinCodex -Codex $codex -AllowForce
        $null = Start-NewskinCodex -Codex $codex
      } catch {
        Write-Warning 'State validation rollback could not fully restart Codex; close Codex to ensure its CDP port is closed.'
      }
    }
    throw
  }

  # Keep a paused, already-running watcher paused until all state checks and any
  # restart consent have succeeded.  A cancelled prompt must be side-effect free.
  Set-NewskinPaused -Paused $false -StateRoot $StateRoot | Out-Null
  $pauseCleared = $true

  if ($ForegroundInjector) {
    try {
      Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
      Exit-NewskinOperationLock -Mutex $operationLock
      $operationLock = $null
      & $node.Path $Injector --watch --port $Port --browser-id $cdpIdentity.BrowserId `
        --theme-dir $themePaths.Active --pause-file $themePaths.PauseFile
      $foregroundExitCode = $LASTEXITCODE
      if ($foregroundExitCode -ne 0 -and $pauseWasSet) {
        Set-NewskinPaused -Paused $true -StateRoot $StateRoot | Out-Null
      }
      exit $foregroundExitCode
    } catch {
      if ($pauseWasSet) {
        try { Set-NewskinPaused -Paused $true -StateRoot $StateRoot | Out-Null } catch {
          Write-Warning 'Foreground startup rollback could not restore the existing paused state.'
        }
      }
      throw
    }
  }

  $state = $null
  $daemon = $null
  try {
    $injectorArgs = @((ConvertTo-NewskinProcessArgument -Value $Injector), '--watch', '--port', "$Port",
      '--browser-id', $cdpIdentity.BrowserId, '--theme-dir',
      (ConvertTo-NewskinProcessArgument -Value $themePaths.Active), '--pause-file',
      (ConvertTo-NewskinProcessArgument -Value $themePaths.PauseFile))
    $daemon = Start-Process -FilePath $node.Path -ArgumentList $injectorArgs -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
    Start-Sleep -Milliseconds 500
    if ($daemon.HasExited) { throw "The injector exited during startup. See $StderrPath" }

    $injectorStartedAt = Get-NewskinProcessStartedAt -ProcessId $daemon.Id
    if (-not $injectorStartedAt) { throw 'The injector process identity could not be recorded safely.' }
    $state = [pscustomobject]@{
      schemaVersion = 3
      platform = 'windows'
      port = $Port
      injectorPid = $daemon.Id
      injectorStartedAt = $injectorStartedAt
      injectorPath = $Injector
      nodePath = $node.Path
      nodeVersion = $node.Version
      codexExe = $codex.Executable
      codexPackageRoot = $codex.PackageRoot
      codexPackageFullName = $codex.PackageFullName
      codexPackageFamilyName = $codex.PackageFamilyName
      codexVersion = $codex.Version
      browserId = $cdpIdentity.BrowserId
      profilePath = $ProfilePath
      themeDir = $themePaths.Active
      pauseFile = $themePaths.PauseFile
      createdAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    Write-NewskinState -Path $StatePath -State $state

    $verify = Invoke-NewskinNative -FilePath $node.Path -ArgumentList @(
      $Injector, '--verify', '--port', "$Port",
      '--browser-id', $cdpIdentity.BrowserId, '--timeout-ms', '30000')
    Write-NewskinUtf8FileAtomically -Path $VerifyPath -Content (($verify.Output -join "`r`n") + "`r`n")
    if ($verify.ExitCode -ne 0) { throw "Newskin verification failed. See $VerifyPath" }
  } catch {
    $startupError = $_
    $injectorStopped = $true
    if ($null -ne $state) {
      try {
        $injectorStopped = Stop-NewskinRecordedInjector -State $state
      } catch {
        $injectorStopped = $false
        Write-Warning $_.Exception.Message
      }
    } elseif ($null -ne $daemon -and -not $daemon.HasExited) {
      try {
        Stop-Process -InputObject $daemon -Force -ErrorAction Stop
        [void]$daemon.WaitForExit(5000)
        $injectorStopped = $daemon.HasExited
      } catch {
        $injectorStopped = $false
        Write-Warning 'The newly created injector could not be stopped during startup rollback.'
      }
    }
    if ($injectorStopped -and -not $launchedWithCdp) {
      try {
        $rollbackIdentity = Get-NewskinVerifiedCdpIdentity -Port $Port -Codex $codex
        if ($null -ne $rollbackIdentity -and $rollbackIdentity.BrowserId -ceq $cdpIdentity.BrowserId) {
          $removal = Invoke-NewskinNative -FilePath $node.Path -ArgumentList @(
            $Injector, '--remove', '--port', "$Port",
            '--browser-id', $cdpIdentity.BrowserId, '--timeout-ms', '5000') -DiscardStderr
          if ($removal.ExitCode -ne 0) { throw 'Injector removal returned a failure status.' }
        }
      } catch {
        Write-Warning 'Startup rollback could not remove the partially applied live skin; reload or close Codex to clear it.'
      }
    }
    if ($injectorStopped) { Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue }
    if ($launchedWithCdp) {
      try {
        Stop-NewskinCodex -Codex $codex -AllowForce
        $null = Start-NewskinCodex -Codex $codex
      } catch {
        Write-Warning 'Startup rollback could not fully restart Codex; close Codex to ensure its CDP port is closed.'
      }
    }
    if ($pauseWasSet -and $pauseCleared) {
      try {
        Set-NewskinPaused -Paused $true -StateRoot $StateRoot | Out-Null
      } catch {
        Write-Warning 'Startup rollback could not restore the existing paused state.'
      }
    }
    throw $startupError
  }

  Write-Host "Codex Newskin is active on verified loopback port $Port."
} finally {
  if ($null -ne $operationLock) { Exit-NewskinOperationLock -Mutex $operationLock }
}
