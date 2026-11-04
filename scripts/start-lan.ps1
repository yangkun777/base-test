# 本机启动 Node，并用 Nginx 把 80 端口反代给同事。
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

function Test-Listen([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-Path (Join-Path $Root '.env'))) {
  throw '缺少 .env。请先复制 .env.example 为 .env，并填入模型 Key。Key 不要写进文档或提交。'
}

if (-not (Test-Path (Join-Path $Root 'frontend\dist\index.html'))) {
  Write-Host '前端还没构建，开始构建...'
  Push-Location (Join-Path $Root 'frontend')
  npm run build
  Pop-Location
}

if (-not (Test-Listen 3100)) {
  $outLog = Join-Path $Root 'data\server-lan.out.log'
  $errLog = Join-Path $Root 'data\server-lan.err.log'
  New-Item -ItemType Directory -Force -Path (Join-Path $Root 'data') | Out-Null
  Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $Root -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden
  $ready = $false
  foreach ($i in 1..20) {
    Start-Sleep -Milliseconds 500
    if (Test-Listen 3100) { $ready = $true; break }
  }
  if (-not $ready) { throw "Node 没有在 3100 端口起来。请看 $errLog" }
  Write-Host 'Node 已启动：http://127.0.0.1:3100'
} else {
  Write-Host '3100 端口已有服务，继续使用现有 Node。'
}

$nginxHome = Join-Path $Root 'deploy\nginx'
$nginxExe = Join-Path $nginxHome 'nginx.exe'
if (-not (Test-Path $nginxExe)) {
  $version = '1.28.0'
  $zip = Join-Path $env:TEMP "nginx-$version.zip"
  $extract = Join-Path $env:TEMP "nginx-$version-extract"
  Write-Host "下载 Nginx $version ..."
  Invoke-WebRequest -Uri "https://nginx.org/download/nginx-$version.zip" -OutFile $zip
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $extract
  $inner = Get-ChildItem $extract -Directory | Select-Object -First 1
  if (Test-Path $nginxHome) { Remove-Item $nginxHome -Recurse -Force }
  Move-Item $inner.FullName $nginxHome
}

Copy-Item (Join-Path $Root 'deploy\nginx.conf') (Join-Path $nginxHome 'conf\nginx.conf') -Force
$prefix = ($nginxHome -replace '\\', '/') + '/'
& $nginxExe -p $prefix -t
if ($LASTEXITCODE -ne 0) { throw 'Nginx 配置检查失败。' }

$pidFile = Join-Path $nginxHome 'logs\nginx.pid'
if (Test-Path $pidFile) {
  & $nginxExe -p $prefix -s reload
  if ($LASTEXITCODE -ne 0) { throw 'Nginx 重载失败。' }
  Write-Host 'Nginx 已重载。'
} else {
  Start-Process -FilePath $nginxExe -ArgumentList @('-p', $prefix) -WorkingDirectory $nginxHome -WindowStyle Hidden
  $ready = $false
  foreach ($i in 1..20) {
    Start-Sleep -Milliseconds 300
    if (Test-Listen 80) { $ready = $true; break }
  }
  if (-not $ready) { throw 'Nginx 没有在 80 端口起来。请看 deploy\nginx\logs\error.log' }
  Write-Host 'Nginx 已启动。'
}

$rule = netsh advfirewall firewall show rule name="Degson GEO LAN 80" 2>$null
if ($LASTEXITCODE -ne 0) {
  netsh advfirewall firewall add rule name="Degson GEO LAN 80" dir=in action=allow protocol=TCP localport=80 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host '80 端口的防火墙规则没加上。请用管理员 PowerShell 再运行一次本脚本，同事才能访问。'
  }
}

$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notmatch 'VMware|Virtual|Clash|Loopback|vEthernet|WSL'
} | Select-Object -ExpandProperty IPAddress
Write-Host ''
Write-Host '本机打开：http://127.0.0.1/'
if ($ips) {
  foreach ($ip in $ips) { Write-Host "同事打开：http://$ip/" }
} else {
  Write-Host '没有找到局域网地址。请在本机运行 ipconfig，把 IPv4 地址发给同事。'
}
