# ShopStock restore.
# Restores a backup zip (made by the in-app backup on /admin or by
# scripts\backup.ps1) into the data folder. Handles the stale-WAL gotcha:
# leftover shopstock.db-wal / -shm files from the OLD database would be
# replayed into the restored one and corrupt it, so all old shopstock.db*
# files are moved aside (kept, not deleted) before the restored db goes in.
#
# The ShopStock server must be STOPPED first (close its console window).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restore.ps1 -Zip "\\fileserver\share\shopstock-backups\shopstock-2026-07-17_0200.zip"

param(
    [Parameter(Mandatory=$true)][string]$Zip,
    [string]$DataDir = ''
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\.."
if (-not $DataDir) { $DataDir = Join-Path $root 'data' }
if (-not (Test-Path $Zip)) { throw "Backup zip not found: $Zip" }

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$dbFile = Join-Path $DataDir 'shopstock.db'

# Refuse to run while the server still has the database open
if (Test-Path $dbFile) {
    try {
        $handle = [System.IO.File]::Open($dbFile, 'Open', 'ReadWrite', 'None')
        $handle.Close()
    } catch {
        throw "The database is in use - stop the ShopStock server first, then re-run this script."
    }
}

# Extract to a temp folder first: validates the whole zip BEFORE touching live data
$work = Join-Path $env:TEMP "shopstock-restore-$stamp"
New-Item -ItemType Directory -Force $work | Out-Null
try {
    Expand-Archive -Path $Zip -DestinationPath $work -Force
    if (-not (Test-Path (Join-Path $work 'shopstock.db'))) {
        throw "This zip does not look like a ShopStock backup (no shopstock.db inside)."
    }

    New-Item -ItemType Directory -Force $DataDir | Out-Null

    # Move the old database aside - shopstock.db AND any -wal / -shm files
    $aside = Join-Path $DataDir "pre-restore-$stamp"
    $old = @(Get-ChildItem $DataDir -Filter 'shopstock.db*' -File -ErrorAction SilentlyContinue)
    if ($old.Count -gt 0) {
        New-Item -ItemType Directory -Force $aside | Out-Null
        $old | Move-Item -Destination $aside -Force
    }

    Move-Item (Join-Path $work 'shopstock.db') $dbFile -Force

    # Photos: merge over the existing folder. Same-name files are replaced;
    # photos added after the backup was taken are left in place (harmless).
    if (Test-Path (Join-Path $work 'photos')) {
        robocopy (Join-Path $work 'photos') (Join-Path $DataDir 'photos') /E /NFL /NDL /NJH /NJS | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy failed with code $LASTEXITCODE" }
        $global:LASTEXITCODE = 0
    }

    Write-Host "Restore complete: $Zip -> $DataDir"
    if ($old.Count -gt 0) {
        Write-Host "The previous database was kept in $aside - delete that folder once you have verified the restore."
    }
    Write-Host "Start the app and spot-check a few items before trusting it."
} finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
