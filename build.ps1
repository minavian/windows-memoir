# Builds Memoir.exe from src\. With -Payload (release.ps1): Memoir Setup.exe instead, to -Out: the same program,
# carrying the rest of Memoir, which it installs from anywhere but a Memoir's own folder (src\Setup.cs). -Payload is
# a zip (carried packed, as app.zip) or a folder (each file carried on its own, as it is, as app/<path>).
param([string]$Payload, [string]$Out)
$ErrorActionPreference = 'Stop'
$memoirRoot = $PSScriptRoot
$sdkRoot = Join-Path $memoirRoot 'build-tools\webview2'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $sdkRoot)) { throw 'Extract the Microsoft.Web.WebView2 1.0.4258.31 NuGet package into build-tools\webview2 first.' }
foreach ($sdkFile in @('lib\net462\Microsoft.Web.WebView2.Core.dll', 'lib\net462\Microsoft.Web.WebView2.WinForms.dll', 'runtimes\win-x64\native\WebView2Loader.dll')) {
    $source = Join-Path $sdkRoot $sdkFile
    $target = Join-Path $memoirRoot (Split-Path -Leaf $source)
    if (!(Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash) { Copy-Item -LiteralPath $source -Destination $target }
}
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$buildFile = Join-Path $memoirRoot 'Memoir.build.exe'
$arguments = @('/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/debug-', ('/out:' + $buildFile), ('/win32manifest:' + (Join-Path $memoirRoot 'src\app.manifest')), '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll', ('/reference:' + (Join-Path $framework 'System.IO.Compression.dll')), ('/reference:' + (Join-Path $framework 'WPF\UIAutomationClient.dll')), ('/reference:' + (Join-Path $framework 'WPF\UIAutomationTypes.dll')), ('/reference:' + (Join-Path $framework 'WPF\WindowsBase.dll')), ('/reference:' + (Join-Path $memoirRoot 'Microsoft.Web.WebView2.Core.dll')), ('/reference:' + (Join-Path $memoirRoot 'Microsoft.Web.WebView2.WinForms.dll')))
$arguments += @('PresentationFramework.dll', 'PresentationCore.dll', 'WindowsFormsIntegration.dll') | ForEach-Object { '/reference:' + (Join-Path $framework ('WPF\' + $_)) }
$arguments += '/reference:System.Xaml.dll'
if (Test-Path -LiteralPath (Join-Path $memoirRoot 'Memoir.ico')) { $arguments += '/win32icon:' + (Join-Path $memoirRoot 'Memoir.ico') }
$arguments += @(Get-ChildItem -LiteralPath (Join-Path $memoirRoot 'src') -Filter '*.cs' | ForEach-Object { $_.FullName })
if ($Payload) {
    $arguments = @($arguments | ForEach-Object { if ($_ -eq ('/out:' + $buildFile)) { '/out:' + $Out } else { $_ } })
    if (Test-Path -LiteralPath $Payload -PathType Container) {
        $base = (Resolve-Path -LiteralPath $Payload).Path.TrimEnd('\')
        $arguments += @(Get-ChildItem -LiteralPath $base -File -Recurse | ForEach-Object { '/resource:' + $_.FullName + ',app/' + $_.FullName.Substring($base.Length + 1).Replace('\', '/') })
    } else { $arguments += '/resource:' + $Payload + ',app.zip' }
    & $compiler @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Memoir Setup build failed.' }
    Write-Output "Built $Out"
    return
}
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'Memoir build failed.' }
$finalFile = Join-Path $memoirRoot 'Memoir.exe'
if (Test-Path -LiteralPath $finalFile) {
    $previousFile = Join-Path $memoirRoot ('build-tools\Memoir.previous-' + [guid]::NewGuid().ToString('N') + '.exe')
    Move-Item -LiteralPath $finalFile -Destination $previousFile
}
Move-Item -LiteralPath $buildFile -Destination $finalFile
Write-Output 'Built Memoir.exe'
