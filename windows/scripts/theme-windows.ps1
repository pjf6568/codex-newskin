if (-not (Get-Command Read-NewskinUtf8File -ErrorAction SilentlyContinue)) {
  . (Join-Path $PSScriptRoot 'config-utf8.ps1')
}

$script:NewskinMaxImageBytes = 16 * 1024 * 1024
$script:NewskinMaxVideoBytes = 32 * 1024 * 1024

function Assert-NewskinNoReparseComponents {
  param([Parameter(Mandatory = $true)][string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $root = [System.IO.Path]::GetPathRoot($fullPath)
  $current = $fullPath
  while ($true) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Managed Newskin path contains a junction or symbolic link: $current"
      }
    }
    $currentNormalized = $current.TrimEnd('\')
    $rootNormalized = $root.TrimEnd('\')
    if ($currentNormalized.Equals($rootNormalized, [System.StringComparison]::OrdinalIgnoreCase)) { break }
    $parent = [System.IO.Path]::GetDirectoryName($current)
    if (-not $parent -or $parent.Equals($current, [System.StringComparison]::OrdinalIgnoreCase)) { break }
    $current = $parent
  }
}

function Ensure-NewskinManagedDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Root
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
  if (-not ($fullPath.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $fullPath.StartsWith($fullRoot + '\', [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "Managed Newskin path escaped its state root: $fullPath"
  }
  Assert-NewskinNoReparseComponents -Path $fullPath
  if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
    throw "Managed Newskin path is a file, not a directory: $fullPath"
  }
  New-Item -ItemType Directory -Force -Path $fullPath | Out-Null
  Assert-NewskinNoReparseComponents -Path $fullPath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Container)) {
    throw "Managed Newskin directory could not be created: $fullPath"
  }
}

function Get-NewskinValidatedImageMetadata {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Get-Command Get-NewskinNodeRuntime -ErrorAction SilentlyContinue)) {
    throw 'Node.js runtime validation is unavailable for image metadata checks.'
  }
  $node = Get-NewskinNodeRuntime
  $metadataScript = Join-Path $PSScriptRoot 'image-metadata.mjs'
  $output = @(& $node.Path $metadataScript '--check' ([System.IO.Path]::GetFullPath($Path)) 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Image metadata is invalid or exceeds the 16384px / 50MP safety limit: $Path"
  }
  try { $metadata = ($output -join "`n") | ConvertFrom-Json -ErrorAction Stop } catch {
    throw "Image metadata helper returned invalid output: $Path"
  }
  if ($null -eq $metadata -or $null -eq $metadata.width -or $null -eq $metadata.height) {
    throw "Image metadata is invalid or exceeds the 16384px / 50MP safety limit: $Path"
  }
}

function Assert-NewskinImageFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$SkipImageMetadata
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Image does not exist: $fullPath"
  }
  $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
  $isVideo = $extension -in @('.mp4', '.webm', '.mov')
  if (-not $isVideo -and $extension -notin @('.png', '.jpg', '.jpeg', '.webp')) {
    throw "Unsupported theme media format: $extension"
  }
  $length = (Get-Item -LiteralPath $fullPath -Force).Length
  if ($length -lt 1) { throw 'Theme media cannot be empty.' }
  $maximum = if ($isVideo) { $script:NewskinMaxVideoBytes } else { $script:NewskinMaxImageBytes }
  if ($length -gt $maximum) {
    throw "Theme media exceeds the $([int]($maximum / 1MB)) MB limit."
  }
  if (-not $isVideo -and -not $SkipImageMetadata) {
    Get-NewskinValidatedImageMetadata -Path $fullPath
  }
}

function Get-NewskinThemePaths {
  param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexNewskin'))
  $fullRoot = [System.IO.Path]::GetFullPath($StateRoot)
  return [pscustomobject]@{
    Root = $fullRoot
    Active = Join-Path $fullRoot 'active-theme'
    Saved = Join-Path $fullRoot 'themes'
    Images = Join-Path $fullRoot 'images'
    PauseFile = Join-Path $fullRoot 'paused'
    State = Join-Path $fullRoot 'state.json'
  }
}

function Test-NewskinThemePathWithin {
  param([string]$Path, [string]$Root)
  if (-not $Path -or -not $Root) { return $false }
  try {
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
    $inside = $fullPath.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $fullPath.StartsWith($fullRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $inside) { return $false }

    $current = $fullPath.TrimEnd('\')
    while ($true) {
      if (-not (Test-Path -LiteralPath $current)) { return $false }
      $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        return $false
      }
      if ($current.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
      }
      $parent = [System.IO.Path]::GetDirectoryName($current)
      if (-not $parent -or $parent.Equals($current, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $false
      }
      $current = $parent.TrimEnd('\')
    }
  } catch {
    return $false
  }
}

function Read-NewskinTheme {
  param(
    [Parameter(Mandatory = $true)][string]$ThemeDirectory,
    [switch]$SkipImageMetadata
  )
  $directory = [System.IO.Path]::GetFullPath($ThemeDirectory)
  Assert-NewskinNoReparseComponents -Path $directory
  $themePath = Join-Path $directory 'theme.json'
  Assert-NewskinNoReparseComponents -Path $themePath
  if (-not (Test-Path -LiteralPath $themePath -PathType Leaf)) {
    throw "Theme metadata is missing: $themePath"
  }
  try {
    $theme = (Read-NewskinUtf8File -Path $themePath) | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "Theme metadata is invalid JSON: $themePath"
  }
  if ($null -eq $theme -or $theme -is [string] -or $theme -is [array] -or -not $theme.image) {
    throw "Theme metadata must be an object with a relative image path: $themePath"
  }
  $image = "$($theme.image)"
  if ([System.IO.Path]::IsPathRooted($image)) { throw 'Theme image path must be relative.' }
  $imagePath = [System.IO.Path]::GetFullPath((Join-Path $directory $image))
  if (-not (Test-NewskinThemePathWithin -Path $imagePath -Root $directory) -or
    -not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
    throw 'Theme image must remain inside its theme directory and exist.'
  }
  Assert-NewskinImageFile -Path $imagePath -SkipImageMetadata:$SkipImageMetadata
  $bannerPath = $null
  $bannerName = if ($theme.home -and $theme.home.banner) { "$($theme.home.banner)" } else { '' }
  if ($bannerName) {
    if ([System.IO.Path]::IsPathRooted($bannerName) -or
      [System.IO.Path]::GetFileName($bannerName) -cne $bannerName) {
      throw 'Theme banner path must be a relative filename.'
    }
    $bannerPath = [System.IO.Path]::GetFullPath((Join-Path $directory $bannerName))
    if (-not (Test-NewskinThemePathWithin -Path $bannerPath -Root $directory) -or
      -not (Test-Path -LiteralPath $bannerPath -PathType Leaf)) {
      throw 'Theme banner must remain inside its theme directory and exist.'
    }
    Assert-NewskinImageFile -Path $bannerPath -SkipImageMetadata:$SkipImageMetadata
  }
  return [pscustomobject]@{
    Directory = $directory
    ThemePath = $themePath
    ImagePath = $imagePath
    BannerPath = $bannerPath
    Theme = $theme
  }
}

function Write-NewskinTheme {
  param(
    [Parameter(Mandatory = $true)][string]$ThemeDirectory,
    [Parameter(Mandatory = $true)][object]$Theme
  )
  Assert-NewskinNoReparseComponents -Path $ThemeDirectory
  New-Item -ItemType Directory -Force -Path $ThemeDirectory | Out-Null
  Assert-NewskinNoReparseComponents -Path $ThemeDirectory
  $json = $Theme | ConvertTo-Json -Depth 8
  $themePath = Join-Path $ThemeDirectory 'theme.json'
  Assert-NewskinNoReparseComponents -Path $themePath
  Write-NewskinUtf8FileAtomically -Path $themePath -Content ($json + "`r`n")
}

function Initialize-NewskinThemeStore {
  param(
    [Parameter(Mandatory = $true)][string]$SkillRoot,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexNewskin')
  )
  $paths = Get-NewskinThemePaths -StateRoot $StateRoot
  foreach ($directory in @($paths.Root, $paths.Active, $paths.Saved, $paths.Images)) {
    Ensure-NewskinManagedDirectory -Path $directory -Root $paths.Root
  }
  $assetRoot = Join-Path $SkillRoot 'assets'
  $assetImage = Join-Path $assetRoot 'newskin-reference.jpg'
  Assert-NewskinImageFile -Path $assetImage
  $activeTheme = Join-Path $paths.Active 'theme.json'
  Assert-NewskinNoReparseComponents -Path $activeTheme
  if (-not (Test-Path -LiteralPath $activeTheme -PathType Leaf)) {
    Ensure-NewskinManagedDirectory -Path $paths.Active -Root $paths.Root
    Assert-NewskinNoReparseComponents -Path (Join-Path $paths.Active 'newskin-reference.jpg')
    $activeImage = Join-Path $paths.Active 'newskin-reference.jpg'
    Copy-Item -LiteralPath (Join-Path $assetRoot 'newskin-reference.jpg') `
      -Destination $activeImage -Force
    Assert-NewskinNoReparseComponents -Path $activeImage
    Assert-NewskinImageFile -Path $activeImage
    $imageArchive = Join-Path $paths.Images 'newskin-reference.jpg'
    Assert-NewskinNoReparseComponents -Path $imageArchive
    Copy-Item -LiteralPath (Join-Path $assetRoot 'newskin-reference.jpg') `
      -Destination $imageArchive -Force
    Assert-NewskinNoReparseComponents -Path $imageArchive
    Assert-NewskinImageFile -Path $imageArchive
    Assert-NewskinNoReparseComponents -Path $activeTheme
    Copy-Item -LiteralPath (Join-Path $assetRoot 'theme.json') -Destination $activeTheme -Force
  }
  $retiredPresetDirectory = Join-Path $paths.Saved 'preset-romantic-rose'
  Assert-NewskinNoReparseComponents -Path $retiredPresetDirectory
  if (Test-Path -LiteralPath $retiredPresetDirectory) {
    Remove-Item -LiteralPath $retiredPresetDirectory -Recurse -Force
  }
  $presetDirectory = Join-Path $paths.Saved 'preset-arina-hashimoto'
  $presetTheme = Join-Path $presetDirectory 'theme.json'
  Assert-NewskinNoReparseComponents -Path $presetDirectory
  Assert-NewskinNoReparseComponents -Path $presetTheme
  if (-not (Test-Path -LiteralPath $presetTheme -PathType Leaf)) {
    Ensure-NewskinManagedDirectory -Path $presetDirectory -Root $paths.Root
    $presetImage = Join-Path $presetDirectory 'newskin-reference.jpg'
    Assert-NewskinNoReparseComponents -Path $presetImage
    Copy-Item -LiteralPath (Join-Path $assetRoot 'newskin-reference.jpg') `
      -Destination $presetImage -Force
    Assert-NewskinNoReparseComponents -Path $presetImage
    Assert-NewskinImageFile -Path $presetImage
    Assert-NewskinNoReparseComponents -Path $presetTheme
    Copy-Item -LiteralPath (Join-Path $assetRoot 'theme.json') -Destination $presetTheme -Force
  }
  $null = Read-NewskinTheme -ThemeDirectory $paths.Active
  return $paths
}

function New-NewskinThemeImageName {
  param([Parameter(Mandatory = $true)][string]$Extension)
  return 'art-' + (Get-Date).ToString('yyyyMMdd-HHmmss-fff') + '-' +
    [guid]::NewGuid().ToString('N').Substring(0, 8) + $Extension.ToLowerInvariant()
}

function Set-NewskinActiveTheme {
  param(
    [Parameter(Mandatory = $true)][string]$ImagePath,
    [AllowNull()][object]$Theme,
    [AllowNull()][string]$BannerPath,
    [string]$Name,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexNewskin')
  )
  $paths = Get-NewskinThemePaths -StateRoot $StateRoot
  Ensure-NewskinManagedDirectory -Path $paths.Root -Root $paths.Root
  Ensure-NewskinManagedDirectory -Path $paths.Active -Root $paths.Root
  Ensure-NewskinManagedDirectory -Path $paths.Images -Root $paths.Root
  $source = [System.IO.Path]::GetFullPath($ImagePath)
  Assert-NewskinImageFile -Path $source
  $extension = [System.IO.Path]::GetExtension($source).ToLowerInvariant()
  $mediaType = if ($extension -in @('.mp4', '.webm', '.mov')) { 'video' } else { 'image' }
  $oldImage = $null
  try { $oldImage = (Read-NewskinTheme -ThemeDirectory $paths.Active).ImagePath } catch {}
  if ($null -eq $Theme) {
    $Theme = [pscustomobject]@{
      schemaVersion = 2
      id = 'custom'
      name = '自定义主题'
      appearance = 'auto'
      art = [pscustomobject]@{ focusX = $null; focusY = $null; safeArea = 'auto'; taskMode = 'auto' }
      palette = [pscustomobject]@{}
      home = [pscustomobject]@{
        title = '今天想把什么变成现实？'
        subtitle = '从一个清晰的想法开始，剩下的交给你和 Codex。'
        suggestions = @(
          [pscustomobject]@{ title = '开始一个新项目'; prompt = '帮我规划一个新项目的第一步。' },
          [pscustomobject]@{ title = '梳理当前任务'; prompt = '帮我梳理当前任务，列出下一步行动。' },
          [pscustomobject]@{ title = '检查一段代码'; prompt = '帮我检查这段代码的潜在问题。' },
          [pscustomobject]@{ title = '写一份实施计划'; prompt = '帮我写一份可执行的实施计划。' }
        )
      }
    }
  }
  $imageName = New-NewskinThemeImageName -Extension $extension
  $target = Join-Path $paths.Active $imageName
  $temporary = Join-Path $paths.Active ('.dream-tmp-' + [guid]::NewGuid().ToString('N') + $extension)
  $temporaryBanner = $null
  try {
    Assert-NewskinNoReparseComponents -Path $target
    Assert-NewskinNoReparseComponents -Path $temporary
    Copy-Item -LiteralPath $source -Destination $temporary -Force
    Assert-NewskinNoReparseComponents -Path $temporary
    Assert-NewskinImageFile -Path $temporary
    Move-Item -LiteralPath $temporary -Destination $target -Force
    Assert-NewskinNoReparseComponents -Path $target
    Assert-NewskinImageFile -Path $target
    $bannerTarget = $null
    $bannerName = if ($Theme.home -and $Theme.home.banner) { "$($Theme.home.banner)" } else { '' }
    if ($bannerName -and $bannerName -ne $imageName) {
      if (-not $BannerPath) { throw 'Theme declares a banner but no banner source was provided.' }
      if ([System.IO.Path]::GetFileName($bannerName) -cne $bannerName) { throw 'Theme banner must be a filename.' }
      $bannerSource = [System.IO.Path]::GetFullPath($BannerPath)
      Assert-NewskinImageFile -Path $bannerSource
      $bannerTarget = Join-Path $paths.Active $bannerName
      $temporaryBanner = Join-Path $paths.Active ('.dream-banner-' + [guid]::NewGuid().ToString('N') +
        [System.IO.Path]::GetExtension($bannerName))
      Assert-NewskinNoReparseComponents -Path $bannerTarget
      Assert-NewskinNoReparseComponents -Path $temporaryBanner
      Copy-Item -LiteralPath $bannerSource -Destination $temporaryBanner -Force
      Assert-NewskinImageFile -Path $temporaryBanner
      Move-Item -LiteralPath $temporaryBanner -Destination $bannerTarget -Force
      Assert-NewskinImageFile -Path $bannerTarget
    }
    $Theme | Add-Member -NotePropertyName image -NotePropertyValue $imageName -Force
    $Theme | Add-Member -NotePropertyName mediaType -NotePropertyValue $mediaType -Force
    if ($Name) { $Theme | Add-Member -NotePropertyName name -NotePropertyValue $Name -Force }
    if (-not $Theme.id) { $Theme | Add-Member -NotePropertyName id -NotePropertyValue 'custom' -Force }
    if (-not $Theme.appearance) { $Theme | Add-Member -NotePropertyName appearance -NotePropertyValue 'auto' -Force }
    if (-not $Theme.art) {
      $Theme | Add-Member -NotePropertyName art -NotePropertyValue `
        ([pscustomobject]@{ focusX = $null; focusY = $null; safeArea = 'auto'; taskMode = 'auto' }) -Force
    }
    if (-not $Theme.palette) {
      $Theme | Add-Member -NotePropertyName palette -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    Write-NewskinTheme -ThemeDirectory $paths.Active -Theme $Theme
  } finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    if ($temporaryBanner) { Remove-Item -LiteralPath $temporaryBanner -Force -ErrorAction SilentlyContinue }
  }
  $sameImage = $oldImage -and ([System.IO.Path]::GetFullPath($oldImage) -ieq [System.IO.Path]::GetFullPath($target))
  if ($oldImage -and -not $sameImage -and
    (Test-NewskinThemePathWithin -Path $oldImage -Root $paths.Active)) {
    Remove-Item -LiteralPath $oldImage -Force -ErrorAction SilentlyContinue
  }
  $imageArchive = Join-Path $paths.Images $imageName
  Assert-NewskinNoReparseComponents -Path $imageArchive
  Copy-Item -LiteralPath $target -Destination $imageArchive -Force
  Assert-NewskinNoReparseComponents -Path $imageArchive
  Assert-NewskinImageFile -Path $imageArchive
  return Read-NewskinTheme -ThemeDirectory $paths.Active
}

function Save-NewskinCurrentTheme {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexNewskin')
  )
  $trimmed = $Name.Trim()
  if (-not $trimmed -or $trimmed.Length -gt 80 -or $trimmed -match '[\u0000-\u001f]') {
    throw 'Theme name must be between 1 and 80 visible characters.'
  }
  $paths = Get-NewskinThemePaths -StateRoot $StateRoot
  Ensure-NewskinManagedDirectory -Path $paths.Root -Root $paths.Root
  Ensure-NewskinManagedDirectory -Path $paths.Saved -Root $paths.Root
  $active = Read-NewskinTheme -ThemeDirectory $paths.Active
  $id = (Get-Date).ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
  $destination = Join-Path $paths.Saved $id
  Ensure-NewskinManagedDirectory -Path $destination -Root $paths.Root
  $extension = [System.IO.Path]::GetExtension($active.ImagePath).ToLowerInvariant()
  $imageName = 'art' + $extension
  $destinationImage = Join-Path $destination $imageName
  Assert-NewskinNoReparseComponents -Path $destinationImage
  Copy-Item -LiteralPath $active.ImagePath -Destination $destinationImage -Force
  Assert-NewskinNoReparseComponents -Path $destinationImage
  Assert-NewskinImageFile -Path $destinationImage
  if ($active.BannerPath) {
    $bannerName = [System.IO.Path]::GetFileName($active.BannerPath)
    $destinationBanner = Join-Path $destination $bannerName
    Copy-Item -LiteralPath $active.BannerPath -Destination $destinationBanner -Force
    Assert-NewskinImageFile -Path $destinationBanner
  }
  $theme = $active.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $theme.id = $id
  $theme.name = $trimmed
  $theme.image = $imageName
  Write-NewskinTheme -ThemeDirectory $destination -Theme $theme
  return Read-NewskinTheme -ThemeDirectory $destination
}

function Get-NewskinSavedThemes {
  param(
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexNewskin'),
    [switch]$SkipImageMetadata
  )
  $paths = Get-NewskinThemePaths -StateRoot $StateRoot
  Ensure-NewskinManagedDirectory -Path $paths.Root -Root $paths.Root
  Ensure-NewskinManagedDirectory -Path $paths.Saved -Root $paths.Root
  if (-not (Test-Path -LiteralPath $paths.Saved -PathType Container)) { return @() }
  $themes = @()
  foreach ($directory in Get-ChildItem -LiteralPath $paths.Saved -Directory -ErrorAction SilentlyContinue) {
    try {
      $loaded = Read-NewskinTheme -ThemeDirectory $directory.FullName -SkipImageMetadata:$SkipImageMetadata
      $themes += [pscustomobject]@{
        Id = "$($loaded.Theme.id)"
        Name = if ($loaded.Theme.name) { "$($loaded.Theme.name)" } else { $directory.Name }
        Path = $directory.FullName
      }
    } catch {}
  }
  return @($themes | Sort-Object Name)
}

function Use-NewskinSavedTheme {
  param(
    [Parameter(Mandatory = $true)][string]$ThemeDirectory,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexNewskin')
  )
  $paths = Get-NewskinThemePaths -StateRoot $StateRoot
  Ensure-NewskinManagedDirectory -Path $paths.Root -Root $paths.Root
  Ensure-NewskinManagedDirectory -Path $paths.Saved -Root $paths.Root
  $directory = [System.IO.Path]::GetFullPath($ThemeDirectory)
  if (-not (Test-NewskinThemePathWithin -Path $directory -Root $paths.Saved)) {
    throw 'Saved theme must remain inside the Newskin themes folder.'
  }
  $saved = Read-NewskinTheme -ThemeDirectory $directory
  $theme = $saved.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  return Set-NewskinActiveTheme -ImagePath $saved.ImagePath -Theme $theme -BannerPath $saved.BannerPath -StateRoot $StateRoot
}

function Set-NewskinPaused {
  param(
    [Parameter(Mandatory = $true)][bool]$Paused,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexNewskin')
  )
  $paths = Get-NewskinThemePaths -StateRoot $StateRoot
  Ensure-NewskinManagedDirectory -Path $paths.Root -Root $paths.Root
  if ($Paused) {
    Assert-NewskinNoReparseComponents -Path $paths.PauseFile
    Write-NewskinUtf8FileAtomically -Path $paths.PauseFile -Content "paused`r`n"
  } else {
    if (Test-Path -LiteralPath $paths.PauseFile) { Assert-NewskinNoReparseComponents -Path $paths.PauseFile }
    Remove-Item -LiteralPath $paths.PauseFile -Force -ErrorAction SilentlyContinue
  }
  return $Paused
}

function Test-NewskinPaused {
  param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexNewskin'))
  return (Test-Path -LiteralPath (Get-NewskinThemePaths -StateRoot $StateRoot).PauseFile -PathType Leaf)
}
