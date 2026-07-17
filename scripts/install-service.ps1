# Installs ShopStock as a Windows service using NSSM, plus a firewall rule.
# Run from an elevated PowerShell on the work PC AFTER copying the project there.
#
# Prereqs:
#   1. Node.js LTS installed (https://nodejs.org)
#   2. nssm.exe available (https://nssm.cc - single exe, put it in C:\tools\nssm or on PATH)
#   3. `npm ci` run in the project folder
#
# Usage: .\install-service.ps1 [-Port 8340] [-NssmPath C:\tools\nssm\nssm.exe]

param(
    [int]$Port = 8340,
    [string]$NssmPath = 'nssm'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\.."
$node = (Get-Command node).Source

Write-Host "Project root: $root"
Write-Host "Node:         $node"

& $NssmPath install ShopStock $node "$root\server.js"
& $NssmPath set ShopStock AppDirectory $root
& $NssmPath set ShopStock DisplayName "ShopStock Inventory"
& $NssmPath set ShopStock Description "Parts inventory + QR labeling web app"
& $NssmPath set ShopStock Start SERVICE_DELAYED_AUTO_START
& $NssmPath set ShopStock AppStdout "$root\data\service.log"
& $NssmPath set ShopStock AppStderr "$root\data\service-error.log"
& $NssmPath set ShopStock AppRotateFiles 1
& $NssmPath set ShopStock AppRotateBytes 1048576
& $NssmPath set ShopStock AppExit Default Restart

New-NetFirewallRule -DisplayName "ShopStock ($Port)" -Direction Inbound `
    -LocalPort $Port -Protocol TCP -Action Allow -Profile Domain,Private

& $NssmPath start ShopStock

Write-Host ""
Write-Host "Service installed and started. Check http://localhost:$Port"
Write-Host "IMPORTANT for LAN access:"
Write-Host "  1. Set ""bindHost"": ""0.0.0.0"" in config.json and restart the service -"
Write-Host "     the default 127.0.0.1 only serves this PC."
Write-Host "  2. Set the Base URL on /admin to this PC's LAN IP before printing QR labels."
