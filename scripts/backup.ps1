# ShopStock nightly backup.
# Snapshots the SQLite DB via the backup API (safe on a live WAL database),
# then zips it together with the photos folder to the destination.
# Schedule with Task Scheduler, e.g. daily at 02:00:
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\shopstock\scripts\backup.ps1 -Dest "\\fileserver\share\shopstock-backups"

param(
    [string]$Dest = "$PSScriptRoot\..\data\backups",
    [int]$KeepDays = 30
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\.."
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$work = Join-Path $env:TEMP "shopstock-backup-$stamp"

# Portable bundle ships its own node.exe at the project root; fall back to PATH
$nodeCmd = if (Test-Path (Join-Path $root 'node.exe')) { Join-Path $root 'node.exe' } else { 'node' }

New-Item -ItemType Directory -Force $work | Out-Null
New-Item -ItemType Directory -Force $Dest | Out-Null

# Consistent DB snapshot through better-sqlite3's backup API
& $nodeCmd -e "
const Database = require('$($root -replace '\\','/')/node_modules/better-sqlite3');
const db = new Database('$($root -replace '\\','/')/data/shopstock.db', { readonly: true });
db.backup('$($work -replace '\\','/')/shopstock.db').then(() => {
  console.log('DB snapshot done');
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
"
if ($LASTEXITCODE -ne 0) { throw "DB snapshot failed" }

# Photos are plain files - safe to copy directly
robocopy (Join-Path $root 'data\photos') (Join-Path $work 'photos') /E /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with code $LASTEXITCODE" }

$zip = Join-Path $Dest "shopstock-$stamp.zip"
Compress-Archive -Path "$work\*" -DestinationPath $zip -Force
Remove-Item -Recurse -Force $work

# Prune old backups
Get-ChildItem $Dest -Filter 'shopstock-*.zip' |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
    Remove-Item -Force

Write-Host "Backup written to $zip"
