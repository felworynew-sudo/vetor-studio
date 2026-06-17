param(
  [string]$SourcePath = 'C:\Users\shika\Downloads\Кликабельность визуальных материалов и психология внимания массовой аудитории.docx',
  [string]$BlogDataPath = 'src\data\blog.json'
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-NodeText {
  param(
    [System.Xml.XmlNode]$Node,
    [System.Xml.XmlNamespaceManager]$NamespaceManager
  )

  return (($Node.SelectNodes('.//w:t', $NamespaceManager) | ForEach-Object { $_.InnerText }) -join '').Trim()
}

function Get-ParagraphStyle {
  param(
    [System.Xml.XmlNode]$Node,
    [System.Xml.XmlNamespaceManager]$NamespaceManager
  )

  $styleNode = $Node.SelectSingleNode('./w:pPr/w:pStyle', $NamespaceManager)
  if (-not $styleNode) {
    return ''
  }

  return $styleNode.GetAttribute('val', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
}

function New-TextBlock {
  param(
    [string]$Id,
    [string]$Text,
    [string]$Size = 'body',
    [bool]$Bold = $false,
    [bool]$Accent = $false,
    [string]$LinkUrl = ''
  )

  return [ordered]@{
    id = $Id
    type = 'text'
    ruText = $Text
    enText = $Text
    size = $Size
    bold = $Bold
    italic = $false
    linkUrl = $LinkUrl
    linkStyle = 'link'
    accent = $Accent
  }
}

function Add-CompactList {
  param(
    [System.Collections.ArrayList]$Blocks,
    [System.Collections.Generic.List[string]]$Items,
    [ref]$BlockIndex
  )

  if ($Items.Count -eq 0) {
    return
  }

  $text = ($Items | ForEach-Object { "• $_" }) -join "`n"
  [void]$Blocks.Add((New-TextBlock -Id "clickability-block-$($BlockIndex.Value)" -Text $text))
  $BlockIndex.Value += 1
  $Items.Clear()
}

if (-not (Test-Path -LiteralPath $SourcePath)) {
  throw "DOCX file not found: $SourcePath"
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedBlogPath = Join-Path $projectRoot $BlogDataPath
$zip = [System.IO.Compression.ZipFile]::OpenRead($SourcePath)

try {
  $entry = $zip.GetEntry('word/document.xml')
  if (-not $entry) {
    throw 'word/document.xml is missing from the DOCX archive.'
  }

  $reader = New-Object System.IO.StreamReader($entry.Open())
  try {
    $documentXml = [xml]$reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
} finally {
  $zip.Dispose()
}

$namespaceManager = New-Object System.Xml.XmlNamespaceManager($documentXml.NameTable)
$namespaceManager.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')

$blocks = New-Object System.Collections.ArrayList
$compactItems = New-Object 'System.Collections.Generic.List[string]'
$blockIndex = 1
$paragraphIndex = 0
$sourceLinksHeadingAdded = $false
$youtubeExamplesAdded = $false
$introImageAdded = $false

foreach ($node in $documentXml.SelectSingleNode('//w:body', $namespaceManager).ChildNodes) {
  if ($node.LocalName -eq 'p') {
    $paragraphIndex += 1
    $text = Get-NodeText -Node $node -NamespaceManager $namespaceManager
    $style = Get-ParagraphStyle -Node $node -NamespaceManager $namespaceManager

    if (-not $text) {
      continue
    }

    if ($style -eq 'Compact') {
      $compactItems.Add($text)
      continue
    }

    Add-CompactList -Blocks $blocks -Items $compactItems -BlockIndex ([ref]$blockIndex)

    if ($style -eq 'Heading1') {
      continue
    }

    if ($paragraphIndex -ge 73 -and $text -match '^https?://') {
      continue
    }

    if ($paragraphIndex -ge 73 -and $text -match '(https?://\S+)') {
      if (-not $sourceLinksHeadingAdded) {
        [void]$blocks.Add((New-TextBlock -Id "clickability-block-$blockIndex" -Text 'Ссылки на исследования' -Size 'hero' -Bold $true -Accent $true))
        $blockIndex += 1
        $sourceLinksHeadingAdded = $true
      }

      $url = $matches[1]
      $referenceLabel = ($text -replace '\s*https?://\S+\s*$', '').Trim()
      try {
        $hostName = ([uri]$url).Host -replace '^www\.', ''
      } catch {
        $hostName = 'источник'
      }

      [void]$blocks.Add((New-TextBlock -Id "clickability-block-$blockIndex" -Text "$referenceLabel — $hostName" -LinkUrl $url))
      $blockIndex += 1
      continue
    }

    if ($style -eq 'Heading2' -or $style -eq 'Heading3') {
      [void]$blocks.Add((New-TextBlock -Id "clickability-block-$blockIndex" -Text $text -Size 'hero' -Bold $true -Accent ($style -eq 'Heading2')))
      $blockIndex += 1
      continue
    }

    [void]$blocks.Add((New-TextBlock -Id "clickability-block-$blockIndex" -Text $text))
    $blockIndex += 1

    if (-not $introImageAdded -and $paragraphIndex -eq 6) {
      [void]$blocks.Add([ordered]@{
        id = "clickability-block-$blockIndex"
        type = 'image'
        src = '/thumbs/clickability-attention.png'
        ratio = 'wide'
        ruAlt = 'Фокус внимания среди визуального шума'
        enAlt = 'A focal point surrounded by visual noise'
        ruCaption = 'Кликабельность начинается с управляемого внимания: один главный сигнал должен считываться быстрее остальных.'
        enCaption = 'Clickability starts with controlled attention: one primary signal should read faster than everything around it.'
      })
      $blockIndex += 1
      $introImageAdded = $true
    }

    if (-not $youtubeExamplesAdded -and $paragraphIndex -eq 18) {
      [void]$blocks.Add([ordered]@{
        id = "clickability-block-$blockIndex"
        type = 'carousel'
        images = @(
          [ordered]@{ src = '/thumbs/alien.jpg'; ratio = 'wide'; ruAlt = 'Пример контрастного YouTube-превью'; enAlt = 'Example of a high-contrast YouTube thumbnail' },
          [ordered]@{ src = '/thumbs/alko.jpg'; ratio = 'wide'; ruAlt = 'Пример превью с крупным персонажем и коротким сообщением'; enAlt = 'Thumbnail example with a dominant subject and concise message' },
          [ordered]@{ src = '/thumbs/30k-1.jpg'; ratio = 'wide'; ruAlt = 'Пример превью с одним смысловым центром'; enAlt = 'Thumbnail example with one clear focal point' }
        )
        ruCaption = 'Примеры разных визуальных решений из портфолио: контраст, крупный смысловой центр и минимум конкурирующих деталей.'
        enCaption = 'Examples from the portfolio: contrast, a dominant focal point, and minimal competing detail.'
      })
      $blockIndex += 1
      $youtubeExamplesAdded = $true
    }

    continue
  }

  if ($node.LocalName -eq 'tbl') {
    Add-CompactList -Blocks $blocks -Items $compactItems -BlockIndex ([ref]$blockIndex)

    $rows = @()
    foreach ($rowNode in $node.SelectNodes('./w:tr', $namespaceManager)) {
      $cells = @()
      foreach ($cellNode in $rowNode.SelectNodes('./w:tc', $namespaceManager)) {
        $cells += Get-NodeText -Node $cellNode -NamespaceManager $namespaceManager
      }
      $rows += ,$cells
    }

    [void]$blocks.Add([ordered]@{
      id = "clickability-block-$blockIndex"
      type = 'table'
      rows = $rows.Count
      columns = if ($rows.Count -gt 0) { $rows[0].Count } else { 1 }
      showHorizontal = $true
      showVertical = $true
      ruCells = $rows
      enCells = $rows
      ruCaption = 'Сводка факторов, которые влияют на внимание, CTR и качество клика.'
      enCaption = 'A summary of factors that influence attention, CTR, and click quality.'
    })
    $blockIndex += 1
  }
}

Add-CompactList -Blocks $blocks -Items $compactItems -BlockIndex ([ref]$blockIndex)

$post = [ordered]@{
  id = 'clickability-and-attention'
  ruTitle = 'Кликабельность визуальных материалов и психология внимания'
  enTitle = 'Clickability of Visual Content and the Psychology of Attention'
  ruDescription = 'Исследование о том, как контраст, эмоции, лица, текст и композиция влияют на внимание, CTR и качество клика.'
  enDescription = 'A research-based guide to contrast, emotion, faces, text, composition, CTR, and click quality. The full article is in Russian.'
  cover = '/thumbs/clickability-attention.png'
  tags = @('education', 'design', 'process')
  blocks = $blocks
  createdAt = '2026-06-12'
}

$existingPosts = @()
if (Test-Path -LiteralPath $resolvedBlogPath) {
  $rawJson = [System.IO.File]::ReadAllText($resolvedBlogPath, [System.Text.Encoding]::UTF8)
  if ($rawJson.Trim()) {
    $existingPosts = @($rawJson | ConvertFrom-Json)
  }
}

$nextPosts = @($post) + @($existingPosts | Where-Object { $_.id -ne $post.id })
$json = $nextPosts | ConvertTo-Json -Depth 100
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($resolvedBlogPath, $json, $utf8WithoutBom)

Write-Output "Imported '$($post.ruTitle)' with $($blocks.Count) blocks into $resolvedBlogPath"
