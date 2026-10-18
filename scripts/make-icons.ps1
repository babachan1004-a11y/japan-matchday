# アプリアイコン（PNG）を描く。 powershell -File scripts/make-icons.ps1 -Design A -OutDir public/icons
#   -Preview を付けると3案を並べた比較画像を書き出す。
param([string]$Design = 'A', [string]$OutDir = 'public/icons', [switch]$Preview)
Add-Type -AssemblyName System.Drawing

function C($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

function Draw-Icon([string]$d, [int]$s) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'; $g.InterpolationMode = 'HighQualityBicubic'
  $red = C '#C8102E'; $white = [System.Drawing.Color]::White
  switch ($d) {
    'A' { # 日の丸ボール：白地に赤い円、中にサッカーボールの五角形
      $g.Clear($white)
      $r = 0.30 * $s; $c = $s / 2
      $g.FillEllipse((New-Object System.Drawing.SolidBrush $red), $c - $r, $c - $r, 2 * $r, 2 * $r)
      $pr = 0.095 * $s
      $pts = 0..4 | ForEach-Object { $a = (-90 + 72 * $_) * [Math]::PI / 180; New-Object System.Drawing.PointF ($c + $pr * [Math]::Cos($a)), ($c + $pr * [Math]::Sin($a)) }
      $g.FillPolygon((New-Object System.Drawing.SolidBrush $white), [System.Drawing.PointF[]]$pts)
      $pen = New-Object System.Drawing.Pen $white, (0.022 * $s)
      foreach ($p in $pts) {
        $dx = $p.X - $c; $dy = $p.Y - $c; $k = ($r * 0.98) / $pr
        $g.DrawLine($pen, $p.X, $p.Y, $c + $dx * $k, $c + $dy * $k)
      }
    }
    'B' { # マッチデー：プレミアの紫地に白いカレンダー、日付部分に赤丸
      $g.Clear((C '#38003C'))
      $x = 0.25 * $s; $y = 0.27 * $s; $w = 0.50 * $s; $h = 0.48 * $s; $rad = 0.06 * $s
      $path = New-Object System.Drawing.Drawing2D.GraphicsPath
      $path.AddArc($x, $y, 2 * $rad, 2 * $rad, 180, 90); $path.AddArc($x + $w - 2 * $rad, $y, 2 * $rad, 2 * $rad, 270, 90)
      $path.AddArc($x + $w - 2 * $rad, $y + $h - 2 * $rad, 2 * $rad, 2 * $rad, 0, 90); $path.AddArc($x, $y + $h - 2 * $rad, 2 * $rad, 2 * $rad, 90, 90); $path.CloseFigure()
      $g.FillPath((New-Object System.Drawing.SolidBrush $white), $path)
      $g.SetClip($path); $g.FillRectangle((New-Object System.Drawing.SolidBrush $red), $x, $y, $w, 0.12 * $s); $g.ResetClip()
      $ring = New-Object System.Drawing.SolidBrush $white
      foreach ($rx in @(0.36, 0.64)) { $g.FillEllipse($ring, $rx * $s - 0.025 * $s, $y - 0.035 * $s, 0.05 * $s, 0.07 * $s) }
      $cr = 0.105 * $s
      $g.FillEllipse((New-Object System.Drawing.SolidBrush $red), $s / 2 - $cr, ($y + 0.12 * $s + ($h - 0.12 * $s) / 2) - $cr, 2 * $cr, 2 * $cr)
    }
    'C' { # 「日」の字：赤地に白い文字
      $g.Clear($red)
      $font = New-Object System.Drawing.Font 'Yu Gothic UI', (0.40 * $s), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
      $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
      $g.DrawString('日', $font, (New-Object System.Drawing.SolidBrush $white), (New-Object System.Drawing.RectangleF 0, (0.02 * $s), $s, $s), $fmt)
    }
  }
  $g.Dispose(); return $bmp
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
if ($Preview) {
  $tile = 300; $gap = 40; $label = 50
  $img = New-Object System.Drawing.Bitmap (3 * $tile + 4 * $gap), ($tile + 2 * $gap + $label)
  $g = [System.Drawing.Graphics]::FromImage($img); $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear((C '#E9EBEF'))
  $font = New-Object System.Drawing.Font 'Yu Gothic UI', 22, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'
  $names = @{ A = 'A 日の丸ボール'; B = 'B マッチデー'; C = 'C 「日」の字' }
  $i = 0
  foreach ($d in 'A', 'B', 'C') {
    $icon = Draw-Icon $d $tile
    $x = $gap + $i * ($tile + $gap)
    # Android のランチャーで丸く切り抜かれた見た目
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath; $clip.AddEllipse($x, $gap, $tile, $tile)
    $g.SetClip($clip); $g.DrawImage($icon, $x, $gap, $tile, $tile); $g.ResetClip()
    $g.DrawString($names[$d], $font, [System.Drawing.Brushes]::Black, (New-Object System.Drawing.RectangleF $x, ($gap + $tile + 10), $tile, $label), $fmt)
    $i++
  }
  $out = Join-Path $OutDir 'icon-candidates.png'; $img.Save($out, [System.Drawing.Imaging.ImageFormat]::Png); "wrote $out"
} else {
  foreach ($s in 192, 512, 180) {
    $name = if ($s -eq 180) { 'apple-touch-icon.png' } else { "icon-$s.png" }
    $b = Draw-Icon $Design $s; $b.Save((Join-Path $OutDir $name), [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose(); "wrote $name"
  }
}
