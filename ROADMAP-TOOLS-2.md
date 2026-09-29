# Верстак — Tools 2.0

Принцип: как с SVGO — не писать велосипед там, где есть зрелое MIT/BSD/Apache-ядро.
Vetor даёт единый интерфейс и локальную обработку, алгоритм берём у специализированных проектов.
AGPL/NC-лицензии не тащим.

Легенда: `[ ]` — не начато, `[~]` — в работе, `[x]` — сделано и задеплоено.

## A. Переделка существующих

- [ ] **A1. Palette Extractor 2.0** — OKLab-квантизация + node-vibrant, семантические роли
      (Dominant / Background / Accent / Highlight / Dark / Muted / Vibrant), экспорт CSS/JSON.
- [ ] **A2. Smart Crop** — smartcrop.js (saliency/edges/skin) + DETR-объекты + лица как boost-регионы,
      штраф за отрезанные лица/людей; превью рамки.
- [ ] **A3. AI Detector → Image Forensics** — отдельные улики: классификатор (честно подписан как
      SDXL-модель), C2PA, EXIF, софт-редактор, JPEG-таблицы/качество, повторное сжатие (ELA),
      несостыковки метаданных. Итог «признаки синтетики: высокие/средние/низкие», без процентов.
      Убрать «EXIF → ×0.75».
- [ ] **A4. Upscaler** — выбор модели (Фото ×2 / Фото ×4 / Иллюстрация-аниме / Быстрый),
      отмена, прогресс по тайлам, прогрев.
- [ ] **A5. Background Remover** — добавить свежую модель (BiRefNet / BEN2, MIT), оставить свой pipeline.
- [ ] **A6. Multitrack Editor** — waveform/timeline на wavesurfer.js.
- [x] **A7. Colorblind Simulator** — Machado 2009 (сделано коммитом 488e9e4).
- [ ] **A8. Mesh Gradient** — сильно расширить (точки, drag, шум, анимация, экспорт PNG/CSS/SVG).
- [ ] **A9. Image Compressor** — кодеки Squoosh через jSquash: MozJPEG, OxiPNG, WebP, AVIF.
- [ ] **A10. Audio Enhancer** — шумоподавление RNNoise (WASM).
- [x] SVG Cleaner (SVGO), QR, Barcode, Image Converter — оставить как есть.

## B. Новые инструменты

- [ ] **B1. Векторизатор** PNG/JPG → SVG (VTracer WASM).
- [ ] **B2. Квантизатор / постеризатор** — 2–64 цвета + дизеринг (image-q).
- [ ] **B3. Упрощение SVG-путей** — ползунок tolerance, до/после.
- [ ] **B4. SVG → React/JSX** (SVGR).
- [ ] **B5. Сабсеттер шрифтов** → WOFF2 (harfbuzz hb-subset + woff2 WASM).
- [ ] **B6. Variable Font Playground** — чтение осей wght/wdth/slnt/opsz.
- [ ] **B7. Подбор пар шрифтов** — по x-height / контрасту / ширине.
- [ ] **B8. LUT-генератор / конвертер** — .cube, превью, экспорт.
- [ ] **B9. Сравнение изображений** — overlay / difference / SSIM.
- [ ] **B10. Бесшовная текстура** — offset + заделка шва.
- [ ] **B11. Normal / Height map генератор.**
- [ ] **B12. Sprite sheet генератор.**
- [ ] **B13. Contact sheet генератор.**
- [ ] **B14. Dithering Lab** — Floyd–Steinberg, Atkinson, Bayer, blue-noise.
- [ ] **B15. VHS / Print Lab** — процедурный стек эффектов.
- [ ] **B16. Перенос палитры** A → B.
- [ ] **B17. Gradient map из фото.**
- [ ] **B18. Accessible Palette Fixer** — минимальный сдвиг в OKLCH до WCAG.
- [ ] **B19. Social Media Crop Pack** — одна картинка → YouTube / VK / Telegram / Instagram / Stories.
- [ ] **B20. Мокап с перспективой** — 4 точки → perspective warp.
