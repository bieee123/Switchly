Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-RoundedRectPath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $Radius * 2
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-SwitchlyIcon {
    param([int]$Size)

    $bitmap = [System.Drawing.Bitmap]::new(
        $Size,
        $Size,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $scale = $Size / 128.0
    $bounds = [System.Drawing.RectangleF]::new(0, 0, $Size, $Size)
    $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $bounds,
        [System.Drawing.Color]::FromArgb(255, 0, 0, 0),
        [System.Drawing.Color]::FromArgb(255, 51, 51, 51),
        45.0
    )

    $backgroundPath = New-RoundedRectPath -X 0 -Y 0 -Width $Size -Height $Size -Radius (26 * $scale)
    $graphics.FillPath($background, $backgroundPath)

    $backCard = New-RoundedRectPath `
        -X (31 * $scale) `
        -Y (29 * $scale) `
        -Width (42 * $scale) `
        -Height (54 * $scale) `
        -Radius (9 * $scale)
    $backBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(150, 255, 255, 255))
    $graphics.FillPath($backBrush, $backCard)

    $frontCard = New-RoundedRectPath `
        -X (51 * $scale) `
        -Y (43 * $scale) `
        -Width (46 * $scale) `
        -Height (54 * $scale) `
        -Radius (9 * $scale)
    $frontBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $graphics.FillPath($frontBrush, $frontCard)

    $dotBrush = [System.Drawing.SolidBrush]::new(
        [System.Drawing.Color]::FromArgb(255, 17, 17, 17)
    )
    $dotSize = [Math]::Max(1.5, 7 * $scale)
    $graphics.FillEllipse(
        $dotBrush,
        (60 * $scale),
        (54 * $scale),
        $dotSize,
        $dotSize
    )

    $linePen = [System.Drawing.Pen]::new(
        [System.Drawing.Color]::FromArgb(210, 17, 17, 17),
        [Math]::Max(1.0, 3 * $scale)
    )
    $graphics.DrawLine(
        $linePen,
        (61 * $scale),
        (70 * $scale),
        (86 * $scale),
        (70 * $scale)
    )
    $graphics.DrawLine(
        $linePen,
        (61 * $scale),
        (79 * $scale),
        (80 * $scale),
        (79 * $scale)
    )

    $output = Join-Path $outDir "icon$Size.png"
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)

    $linePen.Dispose()
    $dotBrush.Dispose()
    $frontBrush.Dispose()
    $backBrush.Dispose()
    $background.Dispose()
    $backgroundPath.Dispose()
    $backCard.Dispose()
    $frontCard.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()

    Write-Output "Wrote $output"
}

foreach ($size in @(16, 32, 48, 128)) {
    New-SwitchlyIcon -Size $size
}
