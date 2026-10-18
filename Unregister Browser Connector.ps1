$ErrorActionPreference = 'Stop'
foreach ($browserKey in @('Software\Google\Chrome','Software\Microsoft\Edge','Software\Chromium','Software\BraveSoftware\Brave-Browser','Software\Vivaldi')) {
    [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree("$browserKey\NativeMessagingHosts\com.minavian.memoir", $false)
}
Write-Output 'Removed Memoir native-host registration for your Windows account. You can also remove the Memoir Windows Connector extension from your browser.'
