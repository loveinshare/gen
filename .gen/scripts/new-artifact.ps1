# 兼容包装：实际逻辑在 gen.mjs（跨平台）。
# 用法：
#   pwsh -File .gen/scripts/new-artifact.ps1 -Kind report -Title "鉴权重构阶段评审" -Format html
#   powershell -ExecutionPolicy Bypass -File .gen/scripts/new-artifact.ps1 -Kind decision -Slug token-store
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('report', 'decision', 'failure', 'handoff', 'plan', 'adr', 'review')]
  [string]$Kind,

  [string]$Title,
  [string]$Slug,

  [ValidateSet('md', 'html')]
  [string]$Format = 'md'
)

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "未找到 node。请安装 Node ≥ 16，或直接用 .gen/templates/ 下的模板手动创建。"
  exit 3
}

$script = Join-Path $PSScriptRoot 'gen.mjs'
$cliArgs = @($script, 'new', $Kind)
if ($Title) { $cliArgs += @('--title', $Title) }
if ($Slug) { $cliArgs += @('--slug', $Slug) }
if ($Kind -eq 'report') { $cliArgs += @('--format', $Format) }

& $node.Source @cliArgs
exit $LASTEXITCODE
