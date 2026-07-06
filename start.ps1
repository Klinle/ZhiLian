<#
.SYNOPSIS
    OpenKnowledge 一键启动脚本
.DESCRIPTION
    依次启动：Docker 数据库 -> 后端 FastAPI -> 前端 Next.js
    每个服务在独立的 PowerShell 窗口中运行，关闭对应窗口即可停止服务。
#>

param(
    [switch]$SkipDb,
    [switch]$SkipFrontend,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "       OpenKnowledge 一键启动脚本" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# ────────────────────────────────────────
# 1. 启动数据库 (Docker)
# ────────────────────────────────────────
if (-not $SkipDb) {
    Write-Host "[1/3] 启动数据库..." -ForegroundColor Yellow

    # 检查 Docker 是否运行
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Docker 未运行，请先启动 Docker Desktop！" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }

    # 检查容器是否已在运行
    $running = docker ps --filter "name=knowledge-assistant-db" --filter "status=running" --format "{{.Names}}" 2>$null
    if ($running -eq "knowledge-assistant-db") {
        Write-Host "  数据库已在运行中，跳过" -ForegroundColor Green
    } else {
        # 启动或创建容器
        Push-Location $ROOT
        docker compose up -d
        Pop-Location
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  数据库启动失败！" -ForegroundColor Red
            Read-Host "按回车键退出"
            exit 1
        }

        # 等待数据库健康
        Write-Host "  等待数据库就绪..." -ForegroundColor Yellow
        $maxWait = 30
        $waited = 0
        while ($waited -lt $maxWait) {
            $health = docker inspect --format "{{.State.Health.Status}}" knowledge-assistant-db 2>$null
            if ($health -eq "healthy") {
                Write-Host "  数据库已就绪 (等待了 ${waited}s)" -ForegroundColor Green
                break
            }
            Start-Sleep -Seconds 2
            $waited += 2
            Write-Host "  ...等待中 (${waited}s)" -ForegroundColor DarkGray
        }
        if ($waited -ge $maxWait) {
            Write-Host "  数据库健康检查超时，但继续启动..." -ForegroundColor DarkYellow
        }
    }
} else {
    Write-Host "[1/3] 跳过数据库启动" -ForegroundColor DarkGray
}

Write-Host ""

# ────────────────────────────────────────
# 2. 启动后端 (FastAPI)
# ────────────────────────────────────────
if (-not $SkipBackend) {
    Write-Host "[2/3] 启动后端 (FastAPI)..." -ForegroundColor Yellow

    $backendDir = Join-Path $ROOT "backend"
    $pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"

    # 检查 venv 是否存在
    if (-not (Test-Path $pythonExe)) {
        Write-Host "  后端 venv 不存在，正在创建..." -ForegroundColor Yellow
        Push-Location $backendDir
        python -m venv venv
        .\venv\Scripts\python.exe -m ensurepip --upgrade
        .\venv\Scripts\python.exe -m pip install -r requirements.txt
        Pop-Location
    }

    # 终止已有的后端进程（避免端口 8000 冲突）
    $existingProcs = Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object {
        (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine -like "*main.py*"
    }
    if ($existingProcs) {
        Write-Host "  检测到已有的后端进程，正在终止..." -ForegroundColor DarkYellow
        $existingProcs | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
        Write-Host "  已终止旧进程" -ForegroundColor Green
    }

    # 在新窗口启动后端
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "
        Write-Host '===== OpenKnowledge 后端 (FastAPI) =====' -ForegroundColor Cyan
        Write-Host ''
        Set-Location '$backendDir'
        Write-Host '启动后端服务 http://localhost:8000 (热重载已启用)...' -ForegroundColor Yellow
        Write-Host ''
        & '$pythonExe' 'main.py'
        Write-Host ''
        Write-Host '后端已停止，按任意键关闭窗口...' -ForegroundColor Red
        `$null = Read-Host
    " -WindowStyle Normal

    Write-Host "  后端已在新窗口启动 (http://localhost:8000)" -ForegroundColor Green

    # 等待后端启动（模块导入 + init_db + seed_data 需要较长时间）
    Write-Host "  等待后端就绪..." -ForegroundColor Yellow
    $maxWait = 90
    $waited = 0
    $ready = $false
    while ($waited -lt $maxWait) {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 3 -UseBasicParsing
            if ($resp.StatusCode -eq 200) {
                Write-Host "  后端已就绪 (等待了 ${waited}s)" -ForegroundColor Green
                $ready = $true
                break
            }
        } catch {
            # 后端尚未启动，正常情况，继续等待
        }
        Start-Sleep -Seconds 3
        $waited += 3
        Write-Host "  ...等待中 (${waited}s)" -ForegroundColor DarkGray
    }
    if (-not $ready) {
        Write-Host "  后端启动超时 (${maxWait}s)，请检查后端窗口是否有报错" -ForegroundColor Red
        Write-Host "  继续启动前端，后端可在新窗口中查看日志..." -ForegroundColor DarkYellow
    }
} else {
    Write-Host "[2/3] 跳过后端启动" -ForegroundColor DarkGray
}

Write-Host ""

# ────────────────────────────────────────
# 3. 启动前端 (Next.js)
# ────────────────────────────────────────
if (-not $SkipFrontend) {
    Write-Host "[3/3] 启动前端 (Next.js)..." -ForegroundColor Yellow

    $frontendDir = Join-Path $ROOT "frontend"

    # 检查 node_modules 是否存在
    if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
        Write-Host "  前端依赖未安装，正在安装..." -ForegroundColor Yellow
        Push-Location $frontendDir
        npm install
        Pop-Location
    }

    # 终止已有的前端进程（避免端口 3000 冲突）
    $existingNode = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
        (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine -like "*next*"
    }
    if ($existingNode) {
        Write-Host "  检测到已有的前端进程，正在终止..." -ForegroundColor DarkYellow
        $existingNode | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
        Write-Host "  已终止旧进程" -ForegroundColor Green
    }

    # 在新窗口启动前端
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "
        Write-Host '===== OpenKnowledge 前端 (Next.js) =====' -ForegroundColor Cyan
        Write-Host ''
        Set-Location '$frontendDir'
        Write-Host '启动前端服务 http://localhost:3000 ...' -ForegroundColor Yellow
        Write-Host ''
        npm run dev
        Write-Host ''
        Write-Host '前端已停止，按任意键关闭窗口...' -ForegroundColor Red
        `$null = Read-Host
    " -WindowStyle Normal

    Write-Host "  前端已在新窗口启动 (http://localhost:3000)" -ForegroundColor Green

    # 等待前端启动（Next.js Turbopack 首次编译较慢）
    Write-Host "  等待前端就绪..." -ForegroundColor Yellow
    $maxWait = 120
    $waited = 0
    $ready = $false
    while ($waited -lt $maxWait) {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -UseBasicParsing
            if ($resp.StatusCode -eq 200) {
                Write-Host "  前端已就绪 (等待了 ${waited}s)" -ForegroundColor Green
                $ready = $true
                break
            }
        } catch {
            # 前端尚未启动，正常情况，继续等待
        }
        Start-Sleep -Seconds 3
        $waited += 3
        Write-Host "  ...等待中 (${waited}s)" -ForegroundColor DarkGray
    }
    if (-not $ready) {
        Write-Host "  前端启动超时 (${maxWait}s)，首次编译可能需要更长时间..." -ForegroundColor DarkYellow
        Write-Host "  请稍后手动访问 http://localhost:3000" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "[3/3] 跳过前端启动" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  全部服务已启动！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  数据库:  localhost:5432" -ForegroundColor White
Write-Host "  后端:    http://localhost:8000" -ForegroundColor White
Write-Host "  前端:    http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "  浏览器即将打开 http://localhost:3000 ..." -ForegroundColor Cyan
Write-Host ""

Start-Sleep -Seconds 2
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "提示：关闭后端/前端窗口即可停止对应服务。" -ForegroundColor DarkGray
Write-Host "      停止数据库: docker compose down" -ForegroundColor DarkGray
Write-Host ""
