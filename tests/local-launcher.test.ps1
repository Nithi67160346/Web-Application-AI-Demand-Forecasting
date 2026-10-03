$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'scripts\local-launcher.ps1'),[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Launcher syntax errors.'}
$definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'PostgresRunning'},$true)
Invoke-Expression $definition.Extent.Text
$data=Join-Path $root ('.cache\pid-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $data|Out-Null
$pidFile=Join-Path $data 'postmaster.pid'
$script:fakeProcess=$null
$script:queryFailure=$false
function Get-CimInstance {
    param($ClassName,$Filter,$ErrorAction)
    if($script:queryFailure){throw 'Simulated process query failure'}
    return $script:fakeProcess
}
function Assert($Condition,$Message){if(!$Condition){throw $Message}}
function WritePid{[IO.File]::WriteAllText($pidFile,"12345`n$data`n0`n25432`n")}
try{
    Assert (!(PostgresRunning)) 'Missing PID should mean stopped.'
    WritePid
    Assert (!(PostgresRunning)) 'Dead process should mean stopped.'
    Assert (!(Test-Path $pidFile)) 'Stale PID should be removed.'
    WritePid
    $script:fakeProcess=[pscustomobject]@{Name='node.exe';CommandLine='node unrelated.js'}
    $rejected=$false
    try{PostgresRunning|Out-Null}catch{$rejected=$_.Exception.Message -like '*another process*'}
    Assert $rejected 'Recycled PID must be rejected.'
    Assert (Test-Path $pidFile) 'Recycled PID file must be retained for inspection.'
    $script:fakeProcess=[pscustomobject]@{Name='postgres.exe';CommandLine=('postgres.exe -D "'+$data.Replace('\','/')+'"')}
    Assert (PostgresRunning) 'Own live PostgreSQL should be recognized.'
    $script:queryFailure=$true
    $rejected=$false
    try{PostgresRunning|Out-Null}catch{$rejected=$_.Exception.Message -like '*query failure*'}
    Assert $rejected 'Query failure must not mean stopped.'
    Assert (Test-Path $pidFile) 'Query failure must retain PID file.'
    Write-Host 'PASS: missing PID, stale PID, recycled PID, live PostgreSQL, process query failure.'
}finally{
    if(Test-Path $pidFile){Remove-Item -LiteralPath $pidFile}
    Remove-Item -LiteralPath $data
}
