$ErrorActionPreference = 'Stop'
$memoirFolder = $PSScriptRoot
$extensionId = (Get-Content -LiteralPath (Join-Path $memoirFolder 'Browser Connector\extension-id.txt') -Raw).Trim()
$hostManifest = Join-Path $memoirFolder 'Browser Connector\native-host.json'
$manifestText = @{name='com.minavian.memoir';description='Memoir local browser connector';path=(Join-Path $memoirFolder 'Memoir.exe');type='stdio';allowed_origins=@("chrome-extension://$extensionId/")} | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($hostManifest, $manifestText, [Text.UTF8Encoding]::new($false))
foreach ($browserKey in @('Software\Google\Chrome','Software\Microsoft\Edge','Software\Chromium','Software\BraveSoftware\Brave-Browser','Software\Vivaldi')) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("$browserKey\NativeMessagingHosts\com.minavian.memoir")
    try { $key.SetValue('', $hostManifest) } finally { $key.Dispose() }
}
Write-Output 'Registered for your Windows account. Load the Browser Connector folder as an unpacked extension in your browser, then open Memoir. No administrator access is needed.'
