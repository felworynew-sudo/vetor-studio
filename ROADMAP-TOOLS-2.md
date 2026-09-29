# Верстак — Tools 2.0

Принцип: как с SVGO — не писать велосипед там, где есть зрелое MIT/BSD/Apache-ядро.
Vetor даёт единый интерфейс и локальную обработку, алгоритм берём у специализированных проектов.
AGPL/NC-лицензии не тащим.

Легенда: `[ ]` — не начато, `[~]` — в работе, `[x]` — сделано и задеплоено.

## A. Переделка существующих

- [x] **A1. Palette Extractor 2.0** — OKLab-квантизация + node-vibrant, семантические роли
      (Dominant / Background / Accent / Highlight / Dark / Muted / Vibrant), экспорт CSS/JSON.
- [x] **A2. Smart Crop** — smartcrop.js (saliency/edges/skin) + DETR-объекты + лица как boost-регионы,
      штраф за отрезанные лица/людей; превью рамки.
- [x] **A3. AI Detector → Image Forensics** — отдельные улики: классификатор (честно подписан как
      SDXL-модель), C2PA, EXIF, софт-редактор, JPEG-таблицы/качество, повторное сжатие (ELA),
      несостыковки метаданных. Итог «признаки синтетики: высокие/средние/низкие», без процентов.
      Убрать «EXIF → ×0.75».
- [x] **A4. Upscaler** — выбор модели (Фото ×2 / Фото ×4 / Иллюстрация-аниме / Быстрый),
      отмена, прогресс по тайлам, прогрев.
- [x] **A5. Background Remover** — добавить свежую модель (BiRefNet / BEN2, MIT), оставить свой pipeline.
- [x] **A6. Multitrack Editor** — не выкидывать (clips/trim/cut/pan/EQ/fades/mixdown уже есть);
      взять идеи waveform-playlist / wavesurfer-multitrack: нормальный waveform-рендер, зум, снэп.
- [x] **A7. Colorblind Simulator** — Machado 2009 (сделано коммитом 488e9e4).
- [x] **A8. Mesh Gradient** — сильно расширить (точки, drag, шум, анимация, экспорт PNG/CSS/SVG).
- [x] **A9. Image Compressor** — кодеки Squoosh через jSquash: MozJPEG, OxiPNG, WebP, AVIF.
- [x] **A10. Audio Enhancer** — нейро-шумоподавление RNNoise (WASM) + громкость по LUFS (EBU R128).
- [x] SVG Cleaner (SVGO), QR, Barcode, Image Converter — оставить как есть.

## B. Новые инструменты

- [x] **B1. Векторизатор** PNG/JPG → SVG (VTracer WASM).
- [x] **B2. Квантизатор / постеризатор** — 2–64 цвета + дизеринг (image-q).
- [x] **B3. Упрощение SVG-путей** — ползунок tolerance, до/после.
- [x] **B4. SVG → React/JSX** (SVGR).
- [ ] **B5. Сабсеттер шрифтов** → WOFF2 (harfbuzz hb-subset + woff2 WASM).
- [ ] **B6. Variable Font Playground** — чтение осей wght/wdth/slnt/opsz.
- [ ] **B7. Подбор пар шрифтов** — по x-height / контрасту / ширине.
- [x] **B8. LUT-генератор / конвертер** — .cube, превью, экспорт.
- [x] **B9. Сравнение изображений** — overlay / difference / SSIM.
- [x] **B10. Бесшовная текстура** — offset + заделка шва.
- [x] **B11. Normal / Height map генератор.**
- [x] **B12. Sprite sheet генератор.**
- [x] **B13. Contact sheet генератор.**
- [x] **B14. Dithering Lab** — Floyd–Steinberg, Atkinson, Bayer, blue-noise.
- [ ] **B15. VHS / Print Lab** — процедурный стек эффектов.
- [x] **B16. Перенос палитры** A → B.
- [x] **B17. Gradient map из фото.**
- [x] **B18. Accessible Palette Fixer** — минимальный сдвиг в OKLCH до WCAG.
- [x] **B19. Social Media Crop Pack** — одна картинка → YouTube / VK / Telegram / Instagram / Stories.
- [x] **B20. Мокап с перспективой** — 4 точки → perspective warp.

## C. Улучшение остальных (полный разбор всех 58)

- [x] **C1. AudioConverter** — ffmpeg.wasm: любые входные форматы, MP3/AAC/OGG/Opus/FLAC на выходе.
- [x] **C2. AudioMetadata** — ядро music-metadata (MP3/MP4/FLAC/Ogg/WAV/AIFF, ID3/APE/Vorbis/MP4 теги).
- [x] **C3. AudioTrimmer** — экспорт не только WAV (через ffmpeg.wasm / lamejs).
- [ ] **C4. BlurAnalyzer** — несколько метрик (Laplacian, Tenengrad, FFT high-freq), карта резкости по зонам.
- [x] **C5. ColorConverter** — OKLCH / OKLab / Lab / LCH / Display-P3, gamut-проверка.
- [x] **C6. ColorGrade** — GPU-пайплайн (WebGL) в linear RGB, full-res.
- [x] **C7. ColorHarmony** — OKLCH-повороты + gamut mapping.
- [x] **C8. ColorWeight** — на OKLab-движке палитры.
- [x] **C9. ContrastChecker** — APCA + авто-исправление цвета (общий движок с B18).
- [ ] **C10. CrtGlitch** — WebGL-шейдер, full-res и анимация.
- [ ] **C11. CssFromSvg** — корректные градиенты (orientation/gradientTransform/opacity), без regex.
- [x] **C12. Duotone** — linear-light, gradient-map, 3 тона.
- [x] **C13. EinkSimulator** — Atkinson/Bayer/уровни серого/цветной e-ink (общий движок с B14).
- [ ] **C14. FaviconGenerator** — ICO (мульти-размер), SVG favicon, maskable, manifest, ZIP.
- [ ] **C15. FireSmoke** — шейдерная/fluid-симуляция.
- [ ] **C16. GlyphMap → Font Lab** — fontkit: инфо, OpenType-фичи, кернинг, variable axes, экспорт глифа SVG.
- [ ] **C17. Halftone** — CMYK с углами растра/розетка, линии, экспорт SVG.
- [ ] **C18. ImageMetadata** — просмотр всех тегов, выборочное удаление, C2PA-инспектор.
- [ ] **C19. Isometry** — экспорт GLB/STL/OBJ.
- [x] **C20. MoodPalettes** — OKLCH + контраст + gamut.
- [x] **C21. PastelPairs** — реальный целевой контраст вместо порога luminance > 0.4.
- [x] **C22. Pixelizer** — image-q квантизация + дизеринг.
- [ ] **C23. RuleOfThirds** — настоящая золотая спираль (4 ориентации).
- [ ] **C24. Text3D** — экспорт GLB, проверка OTF/CFF.
- [x] **C25. VoiceRecorder** — выбор микрофона, шумоподавление после записи.
- [ ] **C26. Watermark** — сохранять исходный формат/качество, ZIP.

## D. Новые инструменты (второй список)

- [x] **D1. OCR — картинка → текст** (tesseract.js).
- [x] **D2. Мокапы устройств** — скрин → iPhone/Android/ноутбук/браузер + фон + текст.
- [ ] **D3. Font Inspector** — объединено с C16.
- [x] **D4. PDF Studio** — merge / split / rotate / водяной знак / сжатие (pdf-lib / qpdf-wasm).
- [x] **D5. Anonymize faces** — автоблюр/пикселизация лиц.
- [x] **D6. Heal / удаление объектов** — inpainting кистью.
- [x] **D7. Heightmap / Terrain генератор** — simplex/fBM, эрозия, 3D-превью, PNG.
- [ ] **D8. SVG Path Editor** — правка кривых мышкой, сетка, snap.
- [x] **D9. Silence Remover** (аудио).
- [x] **D10. Waveform-картинка** из аудио (PNG/SVG).
- [x] **D11. Cover Art Extractor** (обложка из MP3/FLAC/M4A).
- [x] **D12. Audio Tag Editor** — редактирование ID3 (объединить с C2).
- [ ] **D13. Subtitle Editor** — видео + waveform + SRT/VTT.
- [ ] **D14. Stem Splitter** — вокал/барабаны/бас (Demucs WebGPU) — сначала проверить вес модели и скорость.
- [ ] **D15. Relight / Time of Day** — depth-aware relight фото.
- [ ] **D16. Procedural Lab** — объединение генераторов в единый стек (долгосрочно, после C10/C15).
- [ ] **D17. Audio Super-Resolution** — исследовать (AudioSR тяжёлый для браузера), делать только если реально запускается.
