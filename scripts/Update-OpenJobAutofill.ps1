[CmdletBinding()]
param(
  [string]$Remote = "origin",
  [string]$Branch = "main",
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Git 命令失败：git $($Arguments -join ' ')"
  }
}

function Get-ManifestVersion {
  param([string]$Path)

  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json).version
}

function Open-ExtensionManager {
  $browserCandidates = @(
    @{ Name = "Google Chrome"; Url = "chrome://extensions/"; Paths = @(
      "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
      "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
      "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    ) },
    @{ Name = "Brave"; Url = "brave://extensions/"; Paths = @(
      "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
      "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
      "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
    ) },
    @{ Name = "Microsoft Edge"; Url = "edge://extensions/"; Paths = @(
      "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
      "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
      "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
    ) }
  )

  foreach ($browser in $browserCandidates) {
    $executable = $browser.Paths | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if ($executable) {
      Start-Process -FilePath $executable -ArgumentList $browser.Url
      Write-Host "已打开 $($browser.Name) 的扩展管理页。"
      return
    }
  }

  Write-Warning "未检测到 Chrome、Brave 或 Edge，请手动打开浏览器扩展管理页。"
}

try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "没有找到 Git，请先安装 Git for Windows。"
  }

  $scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
  $repoRoot = (& git -C (Join-Path $scriptDirectory "..") rev-parse --show-toplevel 2>$null)
  if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
    throw "脚本不在 Git 仓库中。请用 git clone 获取完整项目。"
  }
  $repoRoot = $repoRoot.Trim()
  $manifestPath = Join-Path $repoRoot "manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "未找到 manifest.json：$manifestPath"
  }

  Write-Host "OpenJobAutofill 本地更新"
  Write-Host "项目目录：$repoRoot"

  $currentBranch = (& git -C $repoRoot branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $currentBranch) {
    throw "当前处于 detached HEAD，已停止更新。"
  }
  if ($currentBranch -ne $Branch) {
    throw "当前分支是 $currentBranch，应为 $Branch。请先切换到 $Branch。"
  }

  & git -C $repoRoot remote get-url $Remote *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "未找到远程仓库 $Remote。"
  }

  $worktreeStatus = (& git -C $repoRoot status --porcelain --untracked-files=normal) -join "`n"
  if ($LASTEXITCODE -ne 0) {
    throw "无法检查工作区状态。"
  }
  if ($worktreeStatus) {
    Write-Host "检测到未提交修改，为避免覆盖文件，本次更新已停止：" -ForegroundColor Yellow
    Write-Host $worktreeStatus
    throw "请先提交、暂存到其他位置或删除这些修改后再更新。"
  }

  $beforeVersion = Get-ManifestVersion -Path $manifestPath
  $beforeCommit = (& git -C $repoRoot rev-parse --short HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "无法读取当前提交。"
  }

  Write-Host "当前版本：$beforeVersion ($beforeCommit)"
  Write-Host "正在从 $Remote/$Branch 获取更新..."
  Invoke-Git -Arguments @("-C", $repoRoot, "pull", "--ff-only", $Remote, $Branch)

  $afterVersion = Get-ManifestVersion -Path $manifestPath
  $afterCommit = (& git -C $repoRoot rev-parse --short HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "无法读取更新后的提交。"
  }

  if ($beforeCommit -eq $afterCommit) {
    Write-Host "已经是最新版本：$afterVersion ($afterCommit)" -ForegroundColor Green
  } else {
    Write-Host "更新完成：$beforeVersion -> $afterVersion" -ForegroundColor Green
    Write-Host "提交变化：$beforeCommit -> $afterCommit"
  }

  Write-Host ""
  Write-Host "接下来请在扩展管理页找到 OpenJobAutofill，点击“重新加载”，再刷新招聘网页。"
  Write-Host "不要删除并重新安装扩展；直接重新加载可以保留本机资料。"

  if (-not $NoOpen) {
    Open-ExtensionManager
  }
  exit 0
} catch {
  Write-Host "错误：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

