[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('setup', 'start', 'stop')]
    [string]$Action,

    [ValidateSet('full', 'demo')]
    [string]$Mode = 'full',

    [switch]$NoBrowser,
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $projectRoot 'docker-compose.yml'
$launcherExitCode = 0
$browserJob = $null

function Invoke-Checked {
    param([string]$Command, [string[]]$CommandArguments)
    & $Command @CommandArguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed (exit code $LASTEXITCODE). Fix the error above and run the launcher again."
    }
}

function Initialize-Environment {
    $environmentFile = Join-Path $projectRoot '.env'
    if (Test-Path -LiteralPath $environmentFile) {
        Write-Host 'Using the existing .env configuration.'
        return
    }
    $template = [System.IO.File]::ReadAllText((Join-Path $projectRoot '.env.example'))
    $randomBytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
    $secret = [System.BitConverter]::ToString($randomBytes).Replace('-', '').ToLowerInvariant()
    $template = [regex]::Replace($template, '(?m)^JWT_SECRET_KEY=.*$', "JWT_SECRET_KEY=$secret")
    [System.IO.File]::WriteAllText($environmentFile, $template, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host 'Created .env with a random JWT secret.'
}

function Test-DockerEngine {
    # PowerShell 5.1 can turn native stderr into terminating errors. Probe with
    # stderr suppressed and check the process exit code instead.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & docker version --format '{{.Server.Version}}' 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally { $ErrorActionPreference = $previousPreference }
}

function Require-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker is missing. Install Docker Desktop, reopen this launcher, or use -Mode demo.'
    }
    Invoke-Checked 'docker' @('compose', 'version')
    if (Test-DockerEngine) { return }

    $desktopFile = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path -LiteralPath $desktopFile) {
        Write-Host 'Starting Docker Desktop. Waiting up to 90 seconds for its engine...'
        Start-Process -FilePath $desktopFile -WindowStyle Hidden
        $timer = [System.Diagnostics.Stopwatch]::StartNew()
        while ($timer.Elapsed.TotalSeconds -lt 90) {
            if (Test-DockerEngine) { return }
            Start-Sleep -Seconds 3
        }
    }
    throw 'Docker engine is unavailable. Open Docker Desktop and wait for the engine to start, then retry. For frontend only, use -Mode demo.'
}

function Require-Node {
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js 22.13.0 or newer, then reopen this launcher.'
    }
    $nodeVersion = & node --version
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read the installed Node.js version.' }
    $runtimeVersion = [version]($nodeVersion.Trim() -replace '^v', '')
    if ($runtimeVersion -lt [version]'22.13.0') {
        throw "Node.js 22.13.0 or newer is required; found $nodeVersion."
    }
}

function Wait-ForHttp {
    param([string[]]$Urls)
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt 180) {
        $ready = $true
        foreach ($url in $Urls) {
            try {
                $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
                if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) { $ready = $false }
            } catch { $ready = $false }
        }
        if ($ready) { return }
        Start-Sleep -Seconds 2
    }
    throw 'Services started, but HTTP readiness timed out. Run docker compose logs web api to inspect startup errors.'
}

Push-Location -LiteralPath $projectRoot
try {
    Write-Host "Demandly | $Action | $Mode" -ForegroundColor Cyan
    if ($Mode -eq 'full') {
        Require-Docker
        if ($Action -eq 'stop') {
            Invoke-Checked 'docker' @('compose', '-f', $composeFile, 'stop')
            Write-Host 'Services stopped. Database data is kept.' -ForegroundColor Green
        } else {
            Initialize-Environment
            Invoke-Checked 'docker' @('compose', '-f', $composeFile, 'config', '--quiet')
            if ($Action -eq 'setup') {
                Invoke-Checked 'docker' @('compose', '-f', $composeFile, 'pull', 'db', 'adminer')
                Invoke-Checked 'docker' @('compose', '-f', $composeFile, 'build', 'api', 'web')
                Write-Host 'Setup completed. Run start-web.cmd next.' -ForegroundColor Green
            } else {
                # Build here as well so start is safe on a fresh checkout or after
                # dependency updates. Docker reuses unchanged build layers.
                Invoke-Checked 'docker' @('compose', '-f', $composeFile, 'up', '-d', '--build', '--wait', '--wait-timeout', '180')
                Write-Host 'Waiting for web and API HTTP endpoints...'
                Wait-ForHttp @('http://localhost:3000/', 'http://localhost:8000/health')
                Write-Host 'Web:      http://localhost:3000/' -ForegroundColor Green
                Write-Host 'API docs: http://localhost:8000/docs'
                Write-Host 'Adminer:  http://localhost:8080'
                Write-Host 'Use stop-web.cmd to stop the services.'
                if (-not $NoBrowser) { Start-Process 'http://localhost:3000/' }
            }
        }
    } else {
        if ($Action -eq 'stop') {
            Write-Host 'For demo mode, press Ctrl+C in the start-web.cmd window.'
        } else {
            Require-Node
            if ($Action -eq 'start') {
                $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
                if ($listeners | Where-Object { $_.Port -eq 3000 }) {
                    throw 'Port 3000 is already in use. Stop the existing server before starting the demo.'
                }
            }
            $env:npm_config_cache = Join-Path $projectRoot '.cache\npm'
            if ($Action -eq 'setup' -or -not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\.bin\vinext.cmd'))) {
                Invoke-Checked 'npm.cmd' @('ci')
            }
            if ($Action -eq 'setup') {
                Write-Host 'Demo setup completed. Run start-web.cmd -Mode demo next.' -ForegroundColor Green
            } else {
                $env:VITE_DEMO_MODE = 'true'
                $env:VITE_BASE_PATH = '/'
                Write-Host 'Frontend demo: http://localhost:3000/' -ForegroundColor Green
                Write-Host 'Keep this window open. Press Ctrl+C to stop the demo.'
                if (-not $NoBrowser) {
                    $browserJob = Start-Job -ScriptBlock {
                        for ($attempt = 0; $attempt -lt 120; $attempt++) {
                            try {
                                $page = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 2
                                if ($page.StatusCode -eq 200) {
                                    Start-Process 'http://localhost:3000/'
                                    break
                                }
                            } catch { }
                            Start-Sleep -Seconds 1
                        }
                    }
                }
                Invoke-Checked 'npm.cmd' @('run', 'dev', '--', '--hostname', 'localhost', '--port', '3000')
            }
        }
    }
} catch {
    $launcherExitCode = 1
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($null -ne $browserJob) {
        Stop-Job -Job $browserJob -ErrorAction SilentlyContinue
        Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue
    }
    Pop-Location
    if (-not $NoPause) {
        Write-Host ''
        Read-Host 'Press Enter to close this window' | Out-Null
    }
}
exit $launcherExitCode
