# Cloudflare Tunnel 快速公网部署脚本
# 用法: 以管理员身份运行 PowerShell，执行:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\deploy-tunnel.ps1

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot
$CLOUDFLARED = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$LOG_DIR = Join-Path $ROOT "tunnel-logs"

# 处理停止参数
if ($args -contains "-Stop") {
    Write-Host "`n[停止] 正在关闭隧道和容器..." -ForegroundColor Yellow
    
    $stateFile = Join-Path $LOG_DIR "tunnel-state.json"
    if (Test-Path $stateFile) {
        $state = Get-Content $stateFile | ConvertFrom-Json
        Stop-Process -Id $state.BackendTunnelPID -ErrorAction SilentlyContinue
        Stop-Process -Id $state.FrontendTunnelPID -ErrorAction SilentlyContinue
    }
    
    docker compose -f (Join-Path $ROOT "docker-compose.yml") down 2>$null
    Write-Host "[OK] 所有服务已停止" -ForegroundColor Green
    exit 0
}

Write-Host "`n========== Cloudflare Tunnel 快速部署 ==========" -ForegroundColor Cyan

# 1. 检查 cloudflared
if (-not (Test-Path $CLOUDFLARED)) {
    Write-Host "[ERROR] cloudflared 未安装，请先运行: winget install Cloudflare.cloudflared" -ForegroundColor Red
    exit 1
}

# 创建日志目录
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }

# 2. 读取 .env 获取 API Key
$envFile = Join-Path $ROOT ".env"
$backendEnvFile = Join-Path $ROOT "backend\.env"
$deepseekKey = ""

if (Test-Path $envFile) {
    $lines = Get-Content $envFile
    foreach ($line in $lines) {
        if ($line -match "^DEEPSEEK_API_KEY=(.+)$") {
            $deepseekKey = $matches[1].Trim()
        }
    }
}
if (-not $deepseekKey -and (Test-Path $backendEnvFile)) {
    $lines = Get-Content $backendEnvFile
    foreach ($line in $lines) {
        if ($line -match "^DEEPSEEK_API_KEY=(.+)$") {
            $deepseekKey = $matches[1].Trim()
        }
    }
}
if (-not $deepseekKey) {
    Write-Host "[ERROR] 未找到 DEEPSEEK_API_KEY，请在 .env 或 backend/.env 中配置" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] DEEPSEEK_API_KEY 已读取" -ForegroundColor Green

# 3. 启动 postgres + backend
Write-Host "`n[1/6] 启动 PostgreSQL + 后端服务..." -ForegroundColor Yellow
# 先确保旧容器停止
docker compose -f (Join-Path $ROOT "docker-compose.yml") down 2>$null
# 只启动 postgres + backend
docker compose -f (Join-Path $ROOT "docker-compose.yml") up -d --build postgres backend
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] 后端启动失败" -ForegroundColor Red
    exit 1
}

# 4. 等待后端就绪
Write-Host "[2/6] 等待后端服务就绪..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8000/docs" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        # 继续等待
    }
}
if (-not $ready) {
    Write-Host "[WARN] 后端未在 60 秒内就绪，继续尝试..." -ForegroundColor DarkYellow
}
Write-Host "[OK] 后端服务已就绪" -ForegroundColor Green

# 5. 启动后端 Cloudflare Tunnel
Write-Host "[3/6] 启动后端 Cloudflare Tunnel..." -ForegroundColor Yellow
$backendLog = Join-Path $LOG_DIR "backend-tunnel.log"
if (Test-Path $backendLog) { Remove-Item $backendLog }

$backendTunnelProc = Start-Process -FilePath $CLOUDFLARED `
    -ArgumentList "tunnel", "--url", "http://localhost:8000", "--loglevel", "debug" `
    -RedirectStandardError $backendLog `
    -WindowStyle Hidden `
    -PassThru

# 等待并解析隧道 URL
$backendUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $backendLog) {
        $content = Get-Content $backendLog -Raw -ErrorAction SilentlyContinue
        if ($content -match "(https://[a-z0-9\-]+\.trycloudflare\.com)") {
            $backendUrl = $matches[1]
            break
        }
    }
}

if (-not $backendUrl) {
    Write-Host "[ERROR] 后端隧道启动失败，请检查 $backendLog" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] 后端公网地址: $backendUrl" -ForegroundColor Green

# 6. 更新 docker-compose.yml 中的 NEXT_PUBLIC_API_URL
Write-Host "[4/6] 更新前端 API 地址并重建..." -ForegroundColor Yellow
$composeFile = Join-Path $ROOT "docker-compose.yml"
$composeContent = Get-Content $composeFile -Raw
$updatedContent = $composeContent -replace "NEXT_PUBLIC_API_URL=\S+", "NEXT_PUBLIC_API_URL=$backendUrl"
Set-Content -Path $composeFile -Value $updatedContent -Encoding UTF8
Write-Host "[OK] docker-compose.yml 已更新 NEXT_PUBLIC_API_URL=$backendUrl" -ForegroundColor Green

# 7. 构建并启动前端
Write-Host "  正在构建前端镜像（可能需要 2-3 分钟）..." -ForegroundColor DarkGray
docker compose -f $composeFile up -d --build frontend
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] 前端构建失败" -ForegroundColor Red
    exit 1
}

# 等待前端就绪
Write-Host "  等待前端服务就绪..." -ForegroundColor DarkGray
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200 -or $resp.StatusCode -eq 307) {
            break
        }
    } catch {
        # 继续等待
    }
}
Write-Host "[OK] 前端服务已就绪" -ForegroundColor Green

# 8. 启动前端 Cloudflare Tunnel
Write-Host "[5/6] 启动前端 Cloudflare Tunnel..." -ForegroundColor Yellow
$frontendLog = Join-Path $LOG_DIR "frontend-tunnel.log"
if (Test-Path $frontendLog) { Remove-Item $frontendLog }

$frontendTunnelProc = Start-Process -FilePath $CLOUDFLARED `
    -ArgumentList "tunnel", "--url", "http://localhost:3000" `
    -RedirectStandardError $frontendLog `
    -WindowStyle Hidden `
    -PassThru

$frontendUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $frontendLog) {
        $content = Get-Content $frontendLog -Raw -ErrorAction SilentlyContinue
        if ($content -match "(https://[a-z0-9\-]+\.trycloudflare\.com)") {
            $frontendUrl = $matches[1]
            break
        }
    }
}

if (-not $frontendUrl) {
    Write-Host "[ERROR] 前端隧道启动失败，请检查 $frontendLog" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] 前端公网地址: $frontendUrl" -ForegroundColor Green

# 9. 输出结果
Write-Host "`n========== 部署成功 ==========" -ForegroundColor Cyan
Write-Host ""
Write-Host "  前端访问地址: $frontendUrl" -ForegroundColor White -BackgroundColor DarkGreen
Write-Host "  后端 API 地址: $backendUrl" -ForegroundColor Gray
Write-Host ""
Write-Host "  登录账号: Kleinle / 123456" -ForegroundColor Yellow
Write-Host ""
Write-Host "  注意事项:" -ForegroundColor Yellow
Write-Host "  - 本机不可关机/休眠，否则隧道断开" -ForegroundColor Gray
Write-Host "  - 隧道 URL 为临时地址，重启脚本后会变化" -ForegroundColor Gray
Write-Host "  - 停止部署: 运行 .\deploy-tunnel.ps1 -Stop" -ForegroundColor Gray
Write-Host "  - 日志文件: $LOG_DIR\" -ForegroundColor Gray
Write-Host ""

# 保存状态文件供停止使用
$state = @{
    BackendTunnelPID = $backendTunnelProc.Id
    FrontendTunnelPID = $frontendTunnelProc.Id
    BackendUrl = $backendUrl
    FrontendUrl = $frontendUrl
} | ConvertTo-Json
Set-Content -Path (Join-Path $LOG_DIR "tunnel-state.json") -Value $state -Encoding UTF8
