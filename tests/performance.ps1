param([int]$MemoirProcessId, [string]$DiagnosticsFile, [string]$OutputFile, [int]$Seconds=30)
$ErrorActionPreference='Stop'
$before=Get-Process -Id $MemoirProcessId
$cpuBefore=$before.TotalProcessorTime.TotalMilliseconds
$started=[datetime]::UtcNow
$allHidden=$true
for($i=0;$i -lt $Seconds;$i++) {
    $state=Get-Content -LiteralPath $DiagnosticsFile -Raw | ConvertFrom-Json
    if($state.pid -ne $MemoirProcessId -or $state.uiLoaded -or $state.visible -or $state.trayMenuOpen){$allHidden=$false}
    Start-Sleep -Seconds 1
}
$after=Get-Process -Id $MemoirProcessId
$elapsed=([datetime]::UtcNow-$started).TotalSeconds
$children=@(Get-CimInstance Win32_Process -Filter "ParentProcessId = $MemoirProcessId" | Select-Object -ExpandProperty Name)
$result=[ordered]@{seconds=[math]::Round($elapsed,2);allSamplesMinimized=$allHidden;cpuMilliseconds=[math]::Round($after.TotalProcessorTime.TotalMilliseconds-$cpuBefore,2);cpuPercentOfOneCore=[math]::Round(($after.TotalProcessorTime.TotalMilliseconds-$cpuBefore)/($elapsed*10),3);residentMB=[math]::Round($after.WorkingSet64/1MB,2);privateMB=[math]::Round($after.PrivateMemorySize64/1MB,2);childProcesses=$children}
$json=$result|ConvertTo-Json -Compress
[IO.File]::WriteAllText($OutputFile,$json,[Text.UTF8Encoding]::new($false))
Write-Output $json
if(!$allHidden -or $children.Count -gt 0){throw 'The performance sample was interrupted by an open interface.'}
