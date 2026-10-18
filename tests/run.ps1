$ErrorActionPreference = 'Stop'
$memoirRoot = Split-Path -Parent $PSScriptRoot
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$references = @('/reference:System.Web.Extensions.dll', ('/reference:' + (Join-Path $framework 'WPF\UIAutomationClient.dll')), ('/reference:' + (Join-Path $framework 'WPF\UIAutomationTypes.dll')), ('/reference:' + (Join-Path $framework 'WPF\WindowsBase.dll')))
function Source($names) { $names | ForEach-Object { Join-Path $memoirRoot ('src\' + $_ + '.cs') } }

$testExe = Join-Path $PSScriptRoot 'EngineTests.exe'
& (Join-Path $framework 'csc.exe') /nologo /target:exe /platform:x64 /optimize+ ('/out:' + $testExe) @references (Source @('Store', 'Engine', 'BrowserProbe', 'SyncData')) (Join-Path $PSScriptRoot 'EngineTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed.' }
& $testExe (Join-Path $PSScriptRoot ('runs\' + [guid]::NewGuid().ToString('N')))
if ($LASTEXITCODE -ne 0) { throw 'Tracking tests failed.' }

# the merge, cleaning and Never track rules: the same cases as the extension's (tests/merge-cases)
$syncExe = Join-Path $PSScriptRoot 'SyncTests.exe'
& (Join-Path $framework 'csc.exe') /nologo /target:exe /platform:x64 /optimize+ ('/out:' + $syncExe) @references (Source @('Store', 'Engine', 'BrowserProbe', 'SyncData')) (Join-Path $PSScriptRoot 'SyncTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Sync test compilation failed.' }
& $syncExe (Join-Path $PSScriptRoot 'merge-cases\merge.json')
if ($LASTEXITCODE -ne 0) { throw 'Shared merge cases failed.' }

$linkExe = Join-Path $PSScriptRoot 'BrowserLinkTests.exe'
& (Join-Path $framework 'csc.exe') /nologo /target:exe /platform:x64 /optimize+ ('/out:' + $linkExe) @references (Source @('Store', 'Engine', 'Identity', 'BrowserProbe', 'BrowserLink', 'Registration', 'SyncData')) (Join-Path $PSScriptRoot 'BrowserLinkTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Browser link test compilation failed.' }
& $linkExe (Join-Path $PSScriptRoot ('runs\' + [guid]::NewGuid().ToString('N')))
if ($LASTEXITCODE -ne 0) { throw 'Browser link tests failed.' }
