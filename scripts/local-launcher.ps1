[CmdletBinding()]
param([ValidateSet('setup','start','stop')][string]$Action='start', [switch]$NoBrowser, [switch]$NoPause)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$runtime=Join-Path $projectRoot '.cache\postgres-runtime'
$pgBin=Join-Path $runtime 'node_modules\@embedded-postgres\windows-x64\native\bin'
$data=Join-Path $projectRoot '.cache\local-db'
$stateFile=Join-Path $projectRoot '.cache\local-services.json'
$python=Join-Path $projectRoot '.venv\Scripts\python.exe'
$exitCode=0
$sourceFiles=@(Get-ChildItem (Join-Path $projectRoot 'api\app\*.py')) + @(Get-ChildItem (Join-Path $projectRoot 'api\migrations\versions\*.py'))
$sourceSignature=($sourceFiles|Sort-Object FullName|ForEach-Object{
    $hasher=[Security.Cryptography.SHA256]::Create()
    try{[BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($_.FullName)))}finally{$hasher.Dispose()}
}) -join ':'

function Checked([string]$Command,[string[]]$Arguments) {
    & $Command @Arguments
    if($LASTEXITCODE -ne 0){throw "$Command failed (exit $LASTEXITCODE)."}
}
function Setting([string]$Name,[string]$Fallback) {
    $content=[IO.File]::ReadAllText((Join-Path $projectRoot '.env'))
    $match=[regex]::Match($content,'(?m)^'+[regex]::Escape($Name)+'=(.*)$')
    if($match.Success){return $match.Groups[1].Value.Trim()}
    return $Fallback
}
function AvailablePort([int]$Start) {
    $ports=@([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()|ForEach-Object{$_.Port})
    while($Start -in $ports){$Start++}
    return $Start
}
function Setup {
    Checked 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'windows-launcher.ps1'),'-Action','setup','-Mode','demo','-NoPause')
    if(!(Test-Path $python)){
        if(Get-Command python -ErrorAction SilentlyContinue){Checked 'python' @('-m','venv',(Join-Path $projectRoot '.venv'))}
        elseif(Get-Command py -ErrorAction SilentlyContinue){Checked 'py' @('-3','-m','venv',(Join-Path $projectRoot '.venv'))}
        else{throw 'Python 3.10+ is required for Local mode. Install Python and rerun setup-local.cmd.'}
    }
    Checked $python @('-c','import sys;sys.exit(sys.version_info<(3,10))')
    if(Get-Command uv -ErrorAction SilentlyContinue){Checked 'uv' @('pip','install','--python',$python,'-r',(Join-Path $projectRoot 'api\requirements-dev.txt'),'--cache-dir',(Join-Path $projectRoot '.cache\uv'))}
    else{Checked $python @('-m','pip','install','-r',(Join-Path $projectRoot 'api\requirements-dev.txt'))}
    if(!(Test-Path (Join-Path $pgBin 'pg_ctl.exe'))){
        $env:npm_config_cache=Join-Path $projectRoot '.cache\npm'
        New-Item -ItemType Directory -Force -Path $runtime|Out-Null
        Checked 'npm.cmd' @('install','--prefix',$runtime,'--save-exact','@embedded-postgres/windows-x64@16.14.0-beta.17')
    }
    if(!(Test-Path (Join-Path $projectRoot '.env'))){
        $content=[IO.File]::ReadAllText((Join-Path $projectRoot '.env.example'))
        $bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
        try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
        $secret=[BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant()
        $content=[regex]::Replace($content,'(?m)^JWT_SECRET_KEY=.*$',"JWT_SECRET_KEY=$secret")
        [IO.File]::WriteAllText((Join-Path $projectRoot '.env'),$content,(New-Object Text.UTF8Encoding($false)))
    }
    Write-Host 'Local setup complete. Run start-local.cmd.' -ForegroundColor Green
}
function StopServices {
    if(Test-Path $stateFile){
        $state=Get-Content $stateFile -Raw|ConvertFrom-Json
        foreach($service in @($state.api,$state.web)){
            if(!$service){continue}
            $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($service.pid)" -ErrorAction SilentlyContinue
            # Never stop a recycled PID or an unrelated program.
            if($process -and $process.CommandLine -like "*$($service.marker)*"){
                $children=@(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($service.pid)" -ErrorAction SilentlyContinue)
                foreach($child in $children){
                    if($child.CommandLine -like '*vinext*' -or $child.CommandLine -like '*npm*' -or $child.CommandLine -like '*app.main:app*'){Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue}
                }
                Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue
            }
        }
    }
    if(Test-Path (Join-Path $data 'postmaster.pid')){
        Checked (Join-Path $pgBin 'pg_ctl.exe') @('-D',$data,'stop','-m','fast','-w')
    }
    Write-Host 'Local services stopped. Database files are kept.' -ForegroundColor Green
}

Push-Location $projectRoot
try{
    if($Action -eq 'setup'){Setup}
    elseif($Action -eq 'stop'){StopServices}
    else{
        if(!(Test-Path $python) -or !(Test-Path (Join-Path $projectRoot '.venv\Scripts\alembic.exe')) -or !(Test-Path (Join-Path $pgBin 'pg_ctl.exe')) -or !(Test-Path (Join-Path $projectRoot 'node_modules\.bin\vinext.cmd')) -or !(Test-Path (Join-Path $projectRoot '.env'))){Setup}
        if(Test-Path $stateFile){
            $existing=Get-Content $stateFile -Raw|ConvertFrom-Json
            try{
                $health=Invoke-RestMethod "$($existing.apiUrl)/health" -TimeoutSec 3
                $webResponse=Invoke-WebRequest $existing.webUrl -UseBasicParsing -TimeoutSec 15
                if($existing.sourceSignature -eq $sourceSignature -and $health.status -eq 'ok' -and $health.service -eq 'demandly-api' -and $webResponse.StatusCode -eq 200){
                    Write-Host "Already running: $($existing.webUrl)" -ForegroundColor Green
                    if(!$NoBrowser){Start-Process $existing.webUrl}
                    exit 0
                }
            }catch{}
            StopServices
        }
        if(!(Test-Path (Join-Path $data 'PG_VERSION'))){
            New-Item -ItemType Directory -Force -Path $data|Out-Null
            Checked (Join-Path $pgBin 'initdb.exe') @('-D',$data,'-U','postgres','--encoding=UTF8','--locale=C','--auth=trust')
        }
        if(Test-Path (Join-Path $data 'postmaster.pid')){
            $dbPort=[int]((Get-Content (Join-Path $data 'postmaster.pid'))[3])
            Checked (Join-Path $pgBin 'pg_ctl.exe') @('-D',$data,'status')
        }else{
            $dbPort=AvailablePort 25432
            Checked (Join-Path $pgBin 'pg_ctl.exe') @('-D',$data,'-l',(Join-Path $projectRoot '.cache\local-postgres.log'),'-o',"-p $dbPort -h 127.0.0.1",'start','-w')
        }
        $env:PGCLIENTENCODING='UTF8'
        Checked $python @((Join-Path $PSScriptRoot 'local-db-init.py'),"$dbPort")
        $apiPort=AvailablePort ([int](Setting 'API_PORT' '8000'))
        $webPort=AvailablePort ([int](Setting 'WEB_PORT' '3000'))
        $env:DATABASE_URL="postgresql+psycopg://postgres@127.0.0.1:$dbPort/demandly_local"
        $env:JWT_SECRET_KEY=Setting 'JWT_SECRET_KEY' ''
        $env:CORS_ORIGINS="http://localhost:$webPort,http://127.0.0.1:$webPort"
        $env:VITE_API_BASE_URL="http://localhost:$apiPort"
        $env:VITE_DEMO_MODE='false'
        $env:VITE_BASE_PATH='/'
        Push-Location (Join-Path $projectRoot 'api')
        try{Checked $python @('-m','alembic','upgrade','head')}finally{Pop-Location}
        $apiMarker=Join-Path $projectRoot 'api'
        $api=Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','app.main:app','--app-dir',('"'+$apiMarker+'"'),'--host','127.0.0.1','--port',"$apiPort") -WorkingDirectory $apiMarker -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot '.cache\local-api.log') -RedirectStandardError (Join-Path $projectRoot '.cache\local-api-error.log') -PassThru
        $node=(Get-Command node).Source
        $webMarker=Join-Path $projectRoot 'node_modules\vinext\dist\cli.js'
        if(!(Test-Path $webMarker)){throw 'Cannot find the installed vinext CLI.'}
        $web=Start-Process -FilePath $node -ArgumentList @(('"'+$webMarker+'"'),'dev','--hostname','localhost','--port',"$webPort") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot '.cache\local-web.log') -RedirectStandardError (Join-Path $projectRoot '.cache\local-web-error.log') -PassThru
        $state=@{api=@{pid=$api.Id;marker=$apiMarker};web=@{pid=$web.Id;marker=$webMarker};apiUrl="http://localhost:$apiPort";webUrl="http://localhost:$webPort/";dbPort=$dbPort;sourceSignature=$sourceSignature}
        $state|ConvertTo-Json -Depth 4|Set-Content $stateFile
        $ready=$false
        $timer=[Diagnostics.Stopwatch]::StartNew()
        while($timer.Elapsed.TotalSeconds -lt 180){
            if($api.HasExited -or $web.HasExited){throw 'A service exited. Inspect .cache/local-api-error.log and .cache/local-web-error.log.'}
            try{$health=Invoke-RestMethod "$($state.apiUrl)/health" -TimeoutSec 3;$webResponse=Invoke-WebRequest $state.webUrl -UseBasicParsing -TimeoutSec 30
                if($health.status -eq 'ok' -and $webResponse.StatusCode -eq 200){$ready=$true;break}
            }catch{}
            Start-Sleep -Seconds 2
        }
        if(!$ready){throw 'Readiness failed. Inspect .cache/local-api-error.log and .cache/local-web-error.log.'}
        Write-Host "Web: $($state.webUrl)" -ForegroundColor Green
        Write-Host "API docs: $($state.apiUrl)/docs"
        Write-Host 'Create an account, then import a mock dataset from the Data page. Use stop-local.cmd to stop.'
        if(!$NoBrowser){Start-Process $state.webUrl}
    }
}catch{$exitCode=1;Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red}
finally{Pop-Location;if(!$NoPause){Read-Host 'Press Enter to close'|Out-Null}}
exit $exitCode
