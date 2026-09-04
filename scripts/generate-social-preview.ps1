Add-Type -AssemblyName System.Drawing

function Add-Ornament {
  param(
    [System.Drawing.Graphics]$Canvas,
    [System.Drawing.Brush]$Brush,
    [int]$X,
    [int]$Y
  )

  $points = [System.Drawing.Point[]]@(
    [System.Drawing.Point]::new($X, $Y - 10),
    [System.Drawing.Point]::new($X + 4, $Y - 4),
    [System.Drawing.Point]::new($X + 10, $Y),
    [System.Drawing.Point]::new($X + 4, $Y + 4),
    [System.Drawing.Point]::new($X, $Y + 10),
    [System.Drawing.Point]::new($X - 4, $Y + 4),
    [System.Drawing.Point]::new($X - 10, $Y),
    [System.Drawing.Point]::new($X - 4, $Y - 4)
  )
  $Canvas.FillPolygon($Brush, $points)
}

$width = 1200
$height = 630
$image = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($image)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$background = [System.Drawing.Rectangle]::new(0, 0, $width, $height)
$gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  $background,
  [System.Drawing.Color]::FromArgb(61, 26, 8),
  [System.Drawing.Color]::FromArgb(29, 12, 4),
  20
)
$graphics.FillRectangle($gradient, $background)

$gold = [System.Drawing.Color]::FromArgb(200, 168, 122)
$cream = [System.Drawing.Color]::FromArgb(247, 234, 213)
$softCream = [System.Drawing.Color]::FromArgb(232, 213, 176)
$borderPen = [System.Drawing.Pen]::new($gold, 2)
$finePen = [System.Drawing.Pen]::new($softCream, 2)
$ornamentBrush = [System.Drawing.SolidBrush]::new($gold)
$graphics.DrawRectangle($borderPen, 42, 42, 1116, 546)
$graphics.DrawRectangle([System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(95, 200, 168, 122), 1), 56, 56, 1088, 518)

$graphics.DrawLine($finePen, 370, 165, 830, 165)
$graphics.DrawLine($finePen, 370, 470, 830, 470)

Add-Ornament $graphics $ornamentBrush 345 165
Add-Ornament $graphics $ornamentBrush 862 165
Add-Ornament $graphics $ornamentBrush 345 470
Add-Ornament $graphics $ornamentBrush 862 470

$markFont = [System.Drawing.Font]::new('Georgia', 156, [System.Drawing.FontStyle]::Bold)
$markSize = $graphics.MeasureString('DK', $markFont)
$graphics.DrawString('DK', $markFont, [System.Drawing.SolidBrush]::new($cream), ($width - $markSize.Width) / 2, 182)

$titleFont = [System.Drawing.Font]::new('Georgia', 30, [System.Drawing.FontStyle]::Regular)
$title = "DK's Writings"
$titleSize = $graphics.MeasureString($title, $titleFont)
$graphics.DrawString($title, $titleFont, [System.Drawing.SolidBrush]::new($softCream), ($width - $titleSize.Width) / 2, 385)

$subtitleFont = [System.Drawing.Font]::new('Georgia', 18, [System.Drawing.FontStyle]::Italic)
$subtitle = 'Words, thoughts, and Kannada'
$subtitleSize = $graphics.MeasureString($subtitle, $subtitleFont)
$graphics.DrawString($subtitle, $subtitleFont, [System.Drawing.SolidBrush]::new($gold), ($width - $subtitleSize.Width) / 2, 430)

$output = Join-Path $PSScriptRoot '..\assets\dk-social-preview.png'
$image.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)

$subtitleFont.Dispose()
$titleFont.Dispose()
$markFont.Dispose()
$ornamentBrush.Dispose()
$finePen.Dispose()
$borderPen.Dispose()
$gradient.Dispose()
$graphics.Dispose()
$image.Dispose()
