# 停止本项目的 Nginx。加上 -IncludeNode 时一并停掉本项目的 Node。
param([switch]$IncludeNode)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nginxHome = Join-Path $Root 'deploy\nginx'
$nginxExe = Join-Path $nginxHome 'nginx.exe'
$prefix = ($nginxHome -replace '\\', '/') + '/'

if (Test-Path $nginxExe) {
  & $nginxExe -p $prefix -s quit
  Write-Host '已通知 Nginx 退出。'
} else {
  Write-Host '没有找到 deploy\nginx\nginx.exe，跳过 Nginx。'
}

if ($IncludeNode) {
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'server\.js' -and $_.CommandLine -match [regex]::Escape($Root)
  }
  foreach ($proc in $procs) {
    Stop-Process -Id $proc.ProcessId -Force
    Write-Host "已停止 Node $($proc.ProcessId)"
  }
  if (-not $procs) { Write-Host '没有找到本项目的 Node 进程。' }
}
