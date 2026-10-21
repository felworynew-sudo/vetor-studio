import { useEffect, useMemo, useRef, useState } from 'react';
import { buildPrompt, EXAMPLES } from '../../utils/spritePrompt';
import {
  SIZES, hasWebGpu, loadPixelGen, generateSprites, despeckle, limitColors, toCanvas,
} from '../../utils/pixelgen';

// Генератор спрайтов (бета): текст → пиксель-арт 16–64 px. Модель PixelGen v2 (28 млн параметров, обучена
// с нуля на пиксельных иконках) работает на устройстве посетителя через onnxruntime-web. Запрос
// достраивается шаблоном до формата обучающих подписей (utils/spritePrompt.js), результат чистится:
// убираются одиночные пиксели, цвета сводятся к палитре.

const TEXT = {
  ru: {
    beta: 'БЕТА',
    betaNote: 'Это бета-версия: модель маленькая и обучена на небольшом наборе. Лучше всего получаются зелья, оружие, сундуки, монстры и персонажи; сложные сцены и точные детали пока не удаются.',
    prompt: 'Что нарисовать', placeholder: 'например: красное зелье, железный меч, зелёный слайм',
    examples: 'Примеры', size: 'Размер', variants: 'Вариантов', seed: 'Сид', random: 'Случайный',
    template: 'Достраивать запрос шаблоном (рекомендуется)', fullPrompt: 'Итоговый запрос для модели', quality: 'Качество',
    qFast: 'Быстро (20 шагов)', qNorm: 'Обычно (30 шагов)', qBest: 'Лучше (50 шагов)',
    palette: 'Палитра', palFree: 'Как есть', pal8: '8 цветов', pal16: '16 цветов', pal32: '32 цвета',
    clean: 'Убрать одиночные пиксели', generate: 'Сгенерировать', stop: 'Остановить', again: 'Ещё варианты',
    loadingModel: 'Загрузка модели…', modelNote: 'Модель (56 МБ) скачивается один раз и кешируется браузером. Генерация идёт на вашем устройстве, запросы никуда не отправляются.',
    generating: 'Генерация…', download: 'PNG', downloadBig: 'PNG ×8', empty: 'Введите запрос и нажмите «Сгенерировать».',
    unknown: 'Не распознано:', unknownHint: 'Пока модель знает английские слова и самые частые русские названия — попробуйте английский.',
    noSubject: 'Предмет из запроса не найден в словаре — отправляю слова как есть, результат может быть хуже.',
    gpuYes: 'WebGPU найден — генерация будет быстрой.', gpuNo: 'WebGPU не найден — генерация пойдёт на процессоре и будет заметно медленнее (16×16 — около 10 с, 64×64 — несколько минут). Для скорости откройте страницу в Chrome или Edge.',
    error: 'Не удалось запустить модель. Попробуйте Chrome или Edge, либо размер поменьше.',
    about: 'О модели и данных', aboutBody: 'PixelGen v2 — диффузионная модель, обученная с нуля, 28 млн параметров. Обучалась на пиксельных иконках и спрайтах: собственная размеченная коллекция, наборы CC0 и CC-BY, подписи созданы автоматически и вручную. Модель экспериментальная: возможны артефакты и неточности.',
    credits: 'Авторы наборов (CC-BY): GreenBear8 — «Potions Pack»; Houston «1AC» Boxler — «Potion sprites»; BizmasterStudios — «Potion Icons». CC0: ChrisPpop, GentleCatStudio, OpenGameArt-сборка «CC0 Potion Icons», «Procedural Potion Icons».',
    rights: 'Результаты генерации можно использовать в своих проектах; помните, что модель могла перенять черты обучающих изображений.',
  },
  en: {
    beta: 'BETA',
    betaNote: 'This is a beta: the model is small and trained on a limited set. It works best for potions, weapons, chests, monsters and characters; complex scenes and fine details are not there yet.',
    prompt: 'What to draw', placeholder: 'e.g. red potion, iron sword, green slime',
    examples: 'Examples', size: 'Size', variants: 'Variants', seed: 'Seed', random: 'Random',
    template: 'Expand the prompt with a template (recommended)', fullPrompt: 'Final prompt sent to the model', quality: 'Quality',
    qFast: 'Fast (20 steps)', qNorm: 'Normal (30 steps)', qBest: 'Better (50 steps)',
    palette: 'Palette', palFree: 'As generated', pal8: '8 colors', pal16: '16 colors', pal32: '32 colors',
    clean: 'Remove stray pixels', generate: 'Generate', stop: 'Stop', again: 'More variants',
    loadingModel: 'Loading model…', modelNote: 'The model (56 MB) downloads once and is cached by the browser. Generation runs on your device; prompts are never sent anywhere.',
    generating: 'Generating…', download: 'PNG', downloadBig: 'PNG ×8', empty: 'Type a prompt and press “Generate”.',
    unknown: 'Not recognized:', unknownHint: 'The model knows English words and the most common Russian names — try English.',
    noSubject: 'The subject was not found in the dictionary — sending the words as is, the result may be worse.',
    gpuYes: 'WebGPU detected — generation will be fast.', gpuNo: 'WebGPU not found — generation runs on the CPU and is much slower (16×16 about 10 s, 64×64 several minutes). For speed use Chrome or Edge.',
    error: 'Could not run the model. Try Chrome or Edge, or a smaller size.',
    about: 'About the model and data', aboutBody: 'PixelGen v2 is a diffusion model trained from scratch, 28M parameters. It was trained on pixel-art icons and sprites: our own labeled collection, CC0 and CC-BY packs, with automatic and manual captions. The model is experimental: artifacts and mistakes are possible.',
    credits: 'CC-BY pack credits: GreenBear8 — “Potions Pack”; Houston “1AC” Boxler — “Potion sprites”; BizmasterStudios — “Potion Icons”. CC0: ChrisPpop, GentleCatStudio, the OpenGameArt “CC0 Potion Icons” collection, “Procedural Potion Icons”.',
    rights: 'You can use the generated images in your projects; keep in mind the model may have picked up traits of its training images.',
  },
};

const STEPS = { fast: 20, norm: 30, best: 50 };

function download(canvas, name) {
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

function Sprite({ img, zoom, t, name }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = toCanvas(img, zoom); const cv = ref.current;
    cv.width = c.width; cv.height = c.height;
    cv.getContext('2d').drawImage(c, 0, 0);
  }, [img, zoom]);
  return (
    <figure className="pg-sprite">
      <canvas ref={ref} className="pg-canvas" aria-label={name} />
      <figcaption className="pg-actions">
        <button type="button" className="tool-btn small" onClick={() => download(toCanvas(img, 1), `${name}.png`)}>{t.download}</button>
        <button type="button" className="tool-btn small ghost" onClick={() => download(toCanvas(img, 8), `${name}-x8.png`)}>{t.downloadBig}</button>
      </figcaption>
    </figure>
  );
}

function PixelGenerator({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [text, setText] = useState('');
  const [size, setSize] = useState(32);
  const [count, setCount] = useState(4);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 99999));
  const [useTpl, setUseTpl] = useState(true);
  const [custom, setCustom] = useState('');
  const [quality, setQuality] = useState('norm');
  const [pal, setPal] = useState(16);
  const [clean, setClean] = useState(true);
  const [gpu, setGpu] = useState(null);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [vocabSet, setVocabSet] = useState(null);
  const stopRef = useRef(false);

  useEffect(() => { hasWebGpu().then((g) => { setGpu(g); if (!g) setCount(1); }); }, []);

  const built = useMemo(() => buildPrompt(text, vocabSet || undefined), [text, vocabSet]);
  const finalPrompt = useTpl ? (custom || built.prompt) : text;
  useEffect(() => { setCustom(''); }, [text, useTpl]);

  async function run(more = false) {
    if (!finalPrompt.trim()) return;
    setError(''); stopRef.current = false; setProgress(0);
    try {
      const device = gpu ? 'webgpu' : 'wasm';
      setBusy('load');
      const gen = await loadPixelGen(device, (got, total) => setProgress(total ? got / total : 0));
      setVocabSet(gen.vocabSet);
      setBusy('gen'); setProgress(0);
      const useSeed = more ? seed + results.length + 1 : seed;
      const imgs = await generateSprites(gen, finalPrompt, {
        width: size, height: size, count: gpu ? count : Math.min(count, 2), steps: STEPS[quality], guidance: gen.cfg.default_guidance || 1.5,
        seed: useSeed, onProgress: setProgress, shouldStop: () => stopRef.current,
      });
      const fixed = imgs.map((im) => limitColors(clean ? despeckle(im) : im, pal));
      setResults(fixed);
    } catch (e) {
      if (String(e.message) !== 'stopped') setError(`${t.error} (${String(e.message || e).slice(0, 120)})`);
    } finally {
      setBusy(''); setProgress(0);
    }
  }

  const zoom = size <= 16 ? 12 : size <= 32 ? 8 : 5;
  const slug = (text || 'sprite').toLowerCase().replace(/[^a-zа-яё0-9]+/g, '-').slice(0, 30) || 'sprite';

  return (
    <div className="tool-panel pixelgen">
      <div className="pg-beta"><span className="pg-badge">{t.beta}</span><span>{t.betaNote}</span></div>

      <div className="tool-field">
        <span className="tool-field-label">{t.prompt}</span>
        <input type="text" className="pg-input" value={text} placeholder={t.placeholder} maxLength={160}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !busy) run(); }} />
        <div className="pg-chips" aria-label={t.examples}>
          {(EXAMPLES[language] || EXAMPLES.ru).map((ex) => (
            <button key={ex} type="button" className="tool-chip" onClick={() => setText(ex)}>{ex}</button>
          ))}
        </div>
        {built.unknown.length > 0 && text && <p className="pg-hint">{t.unknown} {built.unknown.join(', ')}. {t.unknownHint}</p>}
        {useTpl && text && !built.known && built.prompt && <p className="pg-hint">{t.noSubject}</p>}
      </div>

      <div className="pg-row">
        <div className="tool-field">
          <span className="tool-field-label">{t.size}</span>
          <div className="segmented">
            {SIZES.map((s) => (
              <button key={s} type="button" className={`segmented-btn${size === s ? ' is-active' : ''}`} onClick={() => setSize(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.variants}</span>
          <div className="segmented">
            {[1, 2, 4].map((c) => (
              <button key={c} type="button" className={`segmented-btn${count === c ? ' is-active' : ''}`} onClick={() => setCount(c)}>{c}</button>
            ))}
          </div>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.quality}</span>
          <select value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="fast">{t.qFast}</option><option value="norm">{t.qNorm}</option><option value="best">{t.qBest}</option>
          </select>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.palette}</span>
          <select value={pal} onChange={(e) => setPal(Number(e.target.value))}>
            <option value={0}>{t.palFree}</option><option value={8}>{t.pal8}</option><option value={16}>{t.pal16}</option><option value={32}>{t.pal32}</option>
          </select>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.seed}</span>
          <div className="pg-seed">
            <input type="number" value={seed} onChange={(e) => setSeed(Math.max(0, Number(e.target.value) || 0))} />
            <button type="button" className="tool-btn small ghost" onClick={() => setSeed(Math.floor(Math.random() * 99999))}>{t.random}</button>
          </div>
        </div>
      </div>

      <label className="pg-check"><input type="checkbox" checked={useTpl} onChange={(e) => setUseTpl(e.target.checked)} /> {t.template}</label>
      <label className="pg-check"><input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} /> {t.clean}</label>
      {useTpl && built.prompt && (
        <div className="tool-field">
          <span className="tool-field-label">{t.fullPrompt}</span>
          <textarea className="pg-prompt" rows={2} value={custom || built.prompt} onChange={(e) => setCustom(e.target.value)} />
        </div>
      )}

      <div className="pg-run">
        {!busy ? (
          <>
            <button type="button" className="tool-btn primary" disabled={!finalPrompt.trim()} onClick={() => run(false)}>{t.generate}</button>
            {results.length > 0 && <button type="button" className="tool-btn" onClick={() => run(true)}>{t.again}</button>}
          </>
        ) : (
          <button type="button" className="tool-btn" onClick={() => { stopRef.current = true; }}>{t.stop}</button>
        )}
        {busy && (
          <span className="pg-progress" role="status">
            {busy === 'load' ? t.loadingModel : t.generating} {Math.round(progress * 100)}%
            <span className="pg-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></span>
          </span>
        )}
      </div>
      {gpu !== null && <p className="pg-hint">{gpu ? t.gpuYes : t.gpuNo}</p>}
      <p className="pg-hint">{t.modelNote}</p>
      {error && <p className="pg-error" role="alert">{error}</p>}

      <div className="pg-results">
        {results.length === 0 && !busy && <p className="pg-empty">{t.empty}</p>}
        {results.map((img, i) => <Sprite key={`${seed}-${i}-${img.pixels[0]}-${img.pixels.length}`} img={img} zoom={zoom} t={t} name={`${slug}-${size}px-${i + 1}`} />)}
      </div>

      <details className="pg-about">
        <summary>{t.about}</summary>
        <p>{t.aboutBody}</p>
        <p>{t.credits}</p>
        <p>{t.rights}</p>
      </details>
    </div>
  );
}

export default PixelGenerator;
