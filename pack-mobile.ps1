<#
[CLO] pack-mobile.ps1

Zips ONLY the files the extension actually needs at runtime, leaving out the
repo's documentation, the dev harness and probes, and - by default - the 108 MB
full Stockfish build, which no phone can load anyway. Output goes to .\dist\.

    .\pack-mobile.ps1                 # lite engine only   (~6 MB zip)
    .\pack-mobile.ps1 -NoEngine       # no Stockfish at all (~0.8 MB zip)
    .\pack-mobile.ps1 -Full           # both builds, i.e. the desktop set
    .\pack-mobile.ps1 -NoToken        # leave local-token.json out (see below)

THE FILE LIST IS DERIVED, NOT DECLARED. It is read out of manifest.json -
background worker, every content script and stylesheet, the options page, the
icons - and then the HTML files among those are scanned for their own local
<script src> / <link href>, which is how engine/engine.js, engine/san.js and
options/options.js get in. So a new content script, or a new stylesheet on the
options page, is picked up with no edit here. The one thing the manifest cannot
know is declared in $ExtraFiles below, with a guard that fails loudly if the
reference it stands in for disappears.

A MISSING FILE IS A FAILURE, never a smaller zip: everything resolved is checked
to exist before anything is written. That is the whole point of the script - a
mobile build that installs and then breaks is worse than no build.

local-token.json IS INCLUDED, so the phone needs no visit to the options page
to get a working explorer. It holds a live Lichess token, so the zip is as
private as the token is: -NoToken leaves it out for a build going anywhere but
your own device. (pack-and-push.ps1's .crx includes it either way, since
--pack-extension takes the whole directory.)
#>

param(
    [switch]$NoEngine,
    [switch]$Full,
    [switch]$NoToken
)

$ErrorActionPreference = 'Stop'

$ExtDir = $PSScriptRoot
$DistDir = Join-Path $ExtDir 'dist'
$ManifestPath = Join-Path $ExtDir 'manifest.json'

if (-not (Test-Path $ManifestPath)) {
    Write-Error "[CLO] manifest.json not found next to this script ($ExtDir). Move the script into the extension root."
    exit 1
}

$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$Version = $Manifest.version
if (-not $Version) {
    Write-Error "[CLO] Could not read version from manifest.json."
    exit 1
}

# --- collect, from the manifest ------------------------------------------------
# Relative, forward-slashed paths; they double as the zip's entry names.
$files = New-Object System.Collections.Generic.List[string]

function Add-File([string]$rel) {
    if (-not $rel) { return }
    $rel = $rel -replace '\\', '/'
    $rel = $rel -replace '^\./', ''
    if ($rel -match '^(https?:)?//') { return }      # remote reference, not ours to pack
    if ($files -contains $rel) { return }
    $files.Add($rel) | Out-Null
}

Add-File 'manifest.json'

if ($Manifest.background) { Add-File $Manifest.background.service_worker }
if ($Manifest.options_ui) { Add-File $Manifest.options_ui.page }

foreach ($cs in $Manifest.content_scripts) {
    foreach ($j in $cs.js)  { Add-File $j }
    foreach ($c in $cs.css) { Add-File $c }
}

if ($Manifest.icons) {
    foreach ($p in $Manifest.icons.PSObject.Properties) { Add-File $p.Value }
}

foreach ($war in $Manifest.web_accessible_resources) {
    foreach ($r in $war.resources) {
        if ($r -match '[*?]') {
            Write-Warning "[CLO] web_accessible_resources pattern '$r' is not expanded - add it to the ExtraFiles list if it names real files."
        } else {
            Add-File $r
        }
    }
}

# --- the one thing the manifest cannot know ------------------------------------
# The offscreen document is opened by URL string from the worker. Guarded: if
# that reference disappears, say so rather than silently ship a file nothing
# loads (or, worse, miss one that is loaded).
$ExtraFiles = @()

$bgRel = 'background.js'
if ($Manifest.background -and $Manifest.background.service_worker) { $bgRel = $Manifest.background.service_worker }
$bgPath = Join-Path $ExtDir ($bgRel -replace '/', '\')
if (Test-Path $bgPath) {
    $bgSource = Get-Content $bgPath -Raw
    if ($bgSource -match 'engine/offscreen\.html') {
        $ExtraFiles += 'engine/offscreen.html'
    } else {
        Write-Warning "[CLO] $bgRel no longer names engine/offscreen.html - check chrome.offscreen.createDocument and update the ExtraFiles list."
    }
}

foreach ($e in $ExtraFiles) { Add-File $e }

# --- follow HTML pages to their own local assets -------------------------------
# Repeated until nothing new turns up, so a page pulling in a page is handled.
do {
    $before = $files.Count
    foreach ($rel in @($files)) {
        if ($rel -notmatch '\.html?$') { continue }
        $abs = Join-Path $ExtDir ($rel -replace '/', '\')
        if (-not (Test-Path $abs)) { continue }
        $dir = Split-Path $rel -Parent
        $dir = $dir -replace '\\', '/'
        $html = Get-Content $abs -Raw
        $refs = [regex]::Matches($html, '(?:src|href)\s*=\s*["'']([^"''>]+)["'']')
        foreach ($m in $refs) {
            $ref = $m.Groups[1].Value
            if ($ref -match '^(https?:|data:|#|mailto:)') { continue }
            $ref = ($ref -split '[?#]')[0]
            if (-not $ref) { continue }
            if ($ref.StartsWith('/')) {
                Add-File $ref.TrimStart('/')
            } elseif ($dir) {
                Add-File "$dir/$ref"
            } else {
                Add-File $ref
            }
        }
    }
} while ($files.Count -ne $before)

# --- the engine builds ---------------------------------------------------------
# engine/vendor is gitignored and downloaded by hand (README), so its absence is
# a warning rather than an error: the extension runs without it and the engine
# toggle reports missing-build.
$vendorWanted = @()
if (-not $NoEngine) {
    $vendorWanted += 'engine/vendor/stockfish-18-lite.js'
    $vendorWanted += 'engine/vendor/stockfish-18-lite.wasm'
    if ($Full) {
        $vendorWanted += 'engine/vendor/stockfish-18.js'
        $vendorWanted += 'engine/vendor/stockfish-18.wasm'
    }
}
foreach ($v in $vendorWanted) {
    if (Test-Path (Join-Path $ExtDir ($v -replace '/', '\'))) {
        Add-File $v
    } else {
        Write-Warning "[CLO] $v not found - packing without it. See README 'Local engine (optional)'."
    }
}

if (-not $NoToken) {
    if (Test-Path (Join-Path $ExtDir 'local-token.json')) {
        Add-File 'local-token.json'
        $TokenPacked = $true
    } else {
        Write-Warning "[CLO] local-token.json does not exist - the phone will have to be given the token on the options page. See README, 'Install'."
    }
}

# --- verify before writing anything -------------------------------------------
$missing = @()
foreach ($rel in $files) {
    if (-not (Test-Path (Join-Path $ExtDir ($rel -replace '/', '\')))) { $missing += $rel }
}
if ($missing.Count -gt 0) {
    Write-Error ("[CLO] Referenced but missing, nothing packed:`n  " + ($missing -join "`n  "))
    exit 1
}

# --- write ---------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

$suffix = 'mobile'
if ($Full) { $suffix = 'full' }
if ($NoEngine) { $suffix = 'mobile-noengine' }
$ZipPath = Join-Path $DistDir "lichessable-$suffix-$Version.zip"

if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($ZipPath, 'Create')
try {
    foreach ($rel in ($files | Sort-Object)) {
        $abs = Join-Path $ExtDir ($rel -replace '/', '\')
        $size = (Get-Item $abs).Length
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $abs, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        Write-Host ("  {0,11:N0}  {1}" -f $size, $rel)
    }
} finally {
    $zip.Dispose()
}

$total = 0
foreach ($rel in $files) { $total += (Get-Item (Join-Path $ExtDir ($rel -replace '/', '\'))).Length }
$zipSize = (Get-Item $ZipPath).Length

Write-Host ""
Write-Host ("[CLO] Packed {0} files, {1:N0} bytes -> {2:N0} bytes zipped" -f $files.Count, $total, $zipSize)
Write-Host "[CLO] $ZipPath"

if ($TokenPacked) {
    Write-Host "[CLO] Includes local-token.json - this zip carries a live Lichess token."
    Write-Host "[CLO]   Use -NoToken for a build going anywhere but your own device."
}

if (-not $NoEngine -and -not $Full) {
    Write-Host ""
    Write-Host "[CLO] NOTE: only the LITE Stockfish build is in this zip. Engine build detection"
    Write-Host "[CLO]   ('auto') reads a phone in Chrome's 'Desktop site' mode as a desktop and"
    Write-Host "[CLO]   would ask for the missing full build - the engine then reports"
    Write-Host "[CLO]   'missing-build (desktop)' with no fallback, by design. On the phone, open"
    Write-Host "[CLO]   the extension's options page and set Engine build to 'Lite'."
}
