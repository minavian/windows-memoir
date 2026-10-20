# Memoir Setup.exe: Memoir.exe itself, carrying only the rest of what it needs to run (its web files without
# developer comments, the extension IDs without notes, WebView2's libraries, its icons and notices), written to -Out.
# Run, it installs straight into its folder: nothing is unpacked into a temporary folder or run from one, and no
# program is carried inside it (src\Setup.cs). Needs Node and installer\node_modules (npm install in installer\ once).
param([string]$Out = (Join-Path $PSScriptRoot 'release'))
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
& (Join-Path $root 'build.ps1') | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $root 'installer\node_modules\terser'))) { throw 'Run npm install in installer\ first.' }

$stage = Join-Path ([IO.Path]::GetTempPath()) ('memoir-release-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$app = Join-Path $stage 'app'
New-Item -ItemType Directory -Force -Path $app | Out-Null
try {
    foreach ($file in @('Memoir.exe.config', 'Memoir.ico', 'Memoir-rainbow.ico', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll')) {
        Copy-Item -LiteralPath (Join-Path $root $file) -Destination $app
    }
    # the extensions that may link with it: their IDs, one a line, nothing else
    $ids = @(Get-Content -LiteralPath (Join-Path $root 'extension-ids.txt') | ForEach-Object { ($_ -split '#')[0].Trim() } | Where-Object { $_ -match '^[a-p]{32}$' })
    [IO.File]::WriteAllText((Join-Path $app 'extension-ids.txt'), (($ids -join "`r`n") + "`r`n"), (New-Object Text.UTF8Encoding $false))
    if ($ids.Count -lt 2) { Write-Warning 'extension-ids.txt has no Chrome Web Store ID yet: the released Memoir links only with the development extension.' }

    & node (Join-Path $root 'installer\strip.mjs') (Join-Path $root 'web') (Join-Path $app 'web')
    if ($LASTEXITCODE -ne 0) { throw 'Stripping the web files failed.' }
    # icons only the browser extension uses
    foreach ($unused in @('icons\icon48.png', 'icons\rainbow16.png', 'icons\rainbow48.png')) { Remove-Item -LiteralPath (Join-Path $app "web\$unused") -ErrorAction SilentlyContinue }
    # what the licences of what ships ask to travel with it, in one file beside Memoir.exe: the WebView2 SDK's licence
    # and notice (its three DLLs), and the fonts' licence
    $sdk = Join-Path $root 'build-tools\webview2'
    $fonts = Join-Path $app 'web\fonts'
    $rule = "`r`n" + ('-' * 72) + "`r`n`r`n"
    $notices = "Memoir includes these, under their own licences.`r`n" + $rule +
        "Microsoft Edge WebView2 SDK 1.0.4258.31 (Microsoft.Web.WebView2.Core.dll, Microsoft.Web.WebView2.WinForms.dll, WebView2Loader.dll)`r`n`r`n" +
        (Get-Content -LiteralPath (Join-Path $sdk 'LICENSE.txt') -Raw) + "`r`n" + (Get-Content -LiteralPath (Join-Path $sdk 'NOTICE.txt') -Raw) + $rule +
        "Inter (web\fonts\InterVariable-memoir.woff2)`r`n`r`n" + (Get-Content -LiteralPath (Join-Path $fonts 'Inter-LICENSE.txt') -Raw) + $rule +
        "Unbounded (web\fonts\Unbounded-subset.woff2)`r`n`r`n" + (Get-Content -LiteralPath (Join-Path $fonts 'Unbounded-LICENSE.txt') -Raw)
    [IO.File]::WriteAllText((Join-Path $app 'Third-party notices.txt'), $notices, (New-Object Text.UTF8Encoding $false))
    Remove-Item -LiteralPath (Join-Path $fonts 'Inter-LICENSE.txt'), (Join-Path $fonts 'Unbounded-LICENSE.txt')

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $payload = Join-Path $stage 'app.zip'
    [IO.Compression.ZipFile]::CreateFromDirectory($app, $payload, [IO.Compression.CompressionLevel]::Optimal, $false)

    New-Item -ItemType Directory -Force -Path $Out | Out-Null
    $setup = Join-Path $Out 'Memoir Setup.exe'
    & (Join-Path $root 'build.ps1') -Payload $payload -Out $setup | Out-Null
    $size = [math]::Round((Get-Item -LiteralPath $setup).Length / 1KB)
    Write-Output "Built $setup ($size KB)"
} finally { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
