# PowerShell script to create a simple PNG icon
Add-Type -AssemblyName System.Drawing

# Create a 256x256 bitmap
$bitmap = New-Object System.Drawing.Bitmap(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Fill background with blue color (#60a5fa)
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 96, 165, 250))
$graphics.FillRectangle($bgBrush, 0, 0, 256, 256)

# Create white rectangle (paper) at center
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(242, 255, 255, 255))
$graphics.FillRectangle($whiteBrush, 64, 64, 128, 160)

# Create task lines (blue)
$bluePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 30, 64, 175), 4)
$graphics.DrawLine($bluePen, 84, 94, 172, 94)
$graphics.DrawLine($bluePen, 84, 124, 172, 124)
$graphics.DrawLine($bluePen, 84, 154, 172, 154)
$graphics.DrawLine($bluePen, 84, 184, 144, 184)

# Create status circles
$greenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 197, 94))
$redBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 239, 68, 68))
$orangeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 245, 158, 11))

$graphics.FillEllipse($greenBrush, 76, 86, 16, 16)
$graphics.FillEllipse($greenBrush, 76, 116, 16, 16)
$graphics.FillEllipse($redBrush, 76, 146, 16, 16)
$graphics.FillEllipse($orangeBrush, 76, 176, 16, 16)

# Clean up
$graphics.Dispose()

# Save as PNG
$iconPath = "C:\Users\vignatov\Task_Center\app\public\icon.png"
$bitmap.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Host "[OK] PNG icon created at: $iconPath"
