$ErrorActionPreference = 'Stop'
$memoirRoot = Split-Path -Parent $PSScriptRoot
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$testExe = Join-Path $PSScriptRoot 'EngineTests.exe'
& (Join-Path $framework 'csc.exe') /nologo /target:exe /platform:x64 /optimize+ ('/out:' + $testExe) /reference:System.Web.Extensions.dll ('/reference:' + (Join-Path $framework 'WPF\UIAutomationClient.dll')) ('/reference:' + (Join-Path $framework 'WPF\UIAutomationTypes.dll')) ('/reference:' + (Join-Path $framework 'WPF\WindowsBase.dll')) (Join-Path $memoirRoot 'src\Store.cs') (Join-Path $memoirRoot 'src\Engine.cs') (Join-Path $memoirRoot 'src\BrowserProbe.cs') (Join-Path $PSScriptRoot 'EngineTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed.' }
& $testExe (Join-Path $PSScriptRoot ('runs\' + [guid]::NewGuid().ToString('N')))
if ($LASTEXITCODE -ne 0) { throw 'Tracking tests failed.' }
$linkExe = Join-Path $PSScriptRoot 'BrowserLinkTests.exe'
& (Join-Path $framework 'csc.exe') /nologo /target:exe /platform:x64 /optimize+ ('/out:' + $linkExe) /reference:System.Web.Extensions.dll ('/reference:' + (Join-Path $framework 'WPF\UIAutomationClient.dll')) ('/reference:' + (Join-Path $framework 'WPF\UIAutomationTypes.dll')) ('/reference:' + (Join-Path $framework 'WPF\WindowsBase.dll')) (Join-Path $memoirRoot 'src\Store.cs') (Join-Path $memoirRoot 'src\Engine.cs') (Join-Path $memoirRoot 'src\Identity.cs') (Join-Path $memoirRoot 'src\BrowserProbe.cs') (Join-Path $memoirRoot 'src\BrowserLink.cs') (Join-Path $PSScriptRoot 'BrowserLinkTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Browser connector test compilation failed.' }
& $linkExe (Join-Path $PSScriptRoot ('runs\' + [guid]::NewGuid().ToString('N')))
if ($LASTEXITCODE -ne 0) { throw 'Browser connector tests failed.' }
