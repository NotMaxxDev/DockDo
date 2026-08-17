param(
    [switch]$SkipIcons
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$AppModule = Join-Path $RepoRoot 'mobile/android/app'
$Res       = Join-Path $AppModule 'src/main/res'
$Gradlew   = Join-Path $RepoRoot 'mobile/android/gradlew.bat'
$ApkOut    = Join-Path $RepoRoot 'DockDo.apk'

function Add-RoundedRect {
    param($Path, [float]$X, [float]$Y, [float]$W, [float]$H, [float]$R)
    $D = $R * 2
    $Path.AddArc($X, $Y, $D, $D, 180, 90)
    $Path.AddArc($X + $W - $D, $Y, $D, $D, 270, 90)
    $Path.AddArc($X + $W - $D, $Y + $H - $D, $D, $D, 0, 90)
    $Path.AddArc($X, $Y + $H - $D, $D, $D, 90, 90)
    $Path.CloseFigure()
}

function New-Icon {
    param([int]$Size, [string]$OutPath, [switch]$Foreground)
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($Foreground) {
        $s = 0.62 * $Size / 128.0
        $g.TranslateTransform(($Size - 128 * $s) / 2, ($Size - 128 * $s) / 2)
        $g.ScaleTransform($s, $s)
    } else {
        $g.ScaleTransform($Size / 128.0, $Size / 128.0)
        $bg = New-Object System.Drawing.Drawing2D.GraphicsPath
        Add-RoundedRect -Path $bg -X 0 -Y 0 -W 128 -H 128 -R 28
        $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 79, 70, 229))
        $g.FillPath($bgBrush, $bg)
        $bgBrush.Dispose()
        $bg.Dispose()
    }

    $circleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 211, 238))
    $g.FillEllipse($circleBrush, 78, 30, 18, 18)

    $shadowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $shadowPath.AddPolygon([System.Drawing.Point[]]@(
        (New-Object System.Drawing.Point(40, 32)),
        (New-Object System.Drawing.Point(84, 32)),
        (New-Object System.Drawing.Point(78, 44)),
        (New-Object System.Drawing.Point(46, 44))
    ))
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 15, 23, 42))
    $g.FillPath($shadowBrush, $shadowPath)
    $shadowBrush.Dispose()
    $shadowPath.Dispose()

    foreach ($bar in @(
        @{ X = 32; Y = 50; W = 64; A = 235 },
        @{ X = 32; Y = 70; W = 48; A = 158 },
        @{ X = 32; Y = 90; W = 56; A = 97 }
    )) {
        $bp = New-Object System.Drawing.Drawing2D.GraphicsPath
        Add-RoundedRect -Path $bp -X $bar.X -Y $bar.Y -W $bar.W -H 12 -R 6
        $bb = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($bar.A, 255, 255, 255))
        $g.FillPath($bb, $bp)
        $bb.Dispose()
        $bp.Dispose()
    }

    $circleBrush.Dispose()
    $g.Dispose()
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

if (-not $SkipIcons) {
    $sizes = @{
        'mipmap-mdpi'    = @{ Full = 48;  Fg = 108 }
        'mipmap-hdpi'    = @{ Full = 72;  Fg = 162 }
        'mipmap-xhdpi'   = @{ Full = 96;  Fg = 216 }
        'mipmap-xxhdpi'  = @{ Full = 144; Fg = 324 }
        'mipmap-xxxhdpi' = @{ Full = 192; Fg = 432 }
    }
    foreach ($folder in $sizes.Keys) {
        $dir = Join-Path $Res $folder
        $sz = $sizes[$folder]
        New-Icon -Size $sz.Full -OutPath (Join-Path $dir 'ic_launcher.png')
        New-Icon -Size $sz.Full -OutPath (Join-Path $dir 'ic_launcher_round.png')
        New-Icon -Size $sz.Fg -OutPath (Join-Path $dir 'ic_launcher_foreground.png') -Foreground
        Write-Host "icons: $folder"
    }
    Write-Host "Launcher icons regenerated from app/web/public/icon.svg"
}

Push-Location (Join-Path $RepoRoot 'mobile/android')
try {
    & $Gradlew assembleDebug
} finally {
    Pop-Location
}
if ($LASTEXITCODE -ne 0) { throw "Gradle build failed (exit $LASTEXITCODE)" }

$built = Join-Path $AppModule 'build/outputs/apk/debug/app-debug.apk'
if (-not (Test-Path $built)) { throw "APK not found: $built" }
Copy-Item -LiteralPath $built -Destination $ApkOut -Force
Write-Host "APK copied to: $ApkOut"