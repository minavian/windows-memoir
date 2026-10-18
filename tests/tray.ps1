$ErrorActionPreference = 'Stop'
$memoirRoot = Split-Path -Parent $PSScriptRoot
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$references = @('System.Windows.Forms.dll','System.Drawing.dll','System.Web.Extensions.dll','System.Xaml.dll') | ForEach-Object { '/reference:' + $_ }
$references += @('WindowsBase.dll','PresentationCore.dll','PresentationFramework.dll') | ForEach-Object { '/reference:' + (Join-Path $framework ('WPF\' + $_)) }
$sources = @('Store.cs','Appearance.cs','TrayMenu.cs') | ForEach-Object { Join-Path $memoirRoot ('src\' + $_) }
$testExe = Join-Path $PSScriptRoot 'TrayMenuTests.exe'
& (Join-Path $framework 'csc.exe') /nologo /target:exe /platform:x64 /optimize+ ('/out:' + $testExe) @references @sources (Join-Path $PSScriptRoot 'TrayMenuTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Tray menu test compilation failed.' }
& $testExe $memoirRoot
if ($LASTEXITCODE -ne 0) { throw 'Native tray menu checks failed.' }
