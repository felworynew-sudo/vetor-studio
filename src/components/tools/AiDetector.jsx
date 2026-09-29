import { useRef, useState } from 'react';
import { aiBrowserHint, aiErrorHint } from '../../utils/aiSupport';
import { buildEvidence, elaMap, inspectMetadata } from '../../utils/imageForensics';

// Экспертиза изображения (бывший «Детектор AI»). Не выносит бинарный приговор
// и не рисует фальшивую точность «87% AI»: показывает независимые улики —
// C2PA/Content Credentials, метаданные генераторов, камерный EXIF, софт,
// несостыковки, размеры, JPEG-таблицы, ELA-карту и мнение нейро-классификатора
// (честно подписанного: он обучен на SDXL). Итог — уровень признаков.

const MODEL_ID = 'Organika/sdxl-detector';

const TEXT = {
  ru: {
    drop: 'Загрузите изображение', hint: 'Лучше оригинальный файл — скриншот и пересланное фото теряют метаданные',
    change: 'Другое изображение', analyzing: 'Читаю метаданные…', loadingModel: 'Загрузка классификатора…', classifying: 'Классификатор: несколько фрагментов…',
    runModel: 'Запустить нейро-классификатор', modelNote: 'Модель ~350 МБ, скачивается один раз и кешируется браузером.',
    verdictTitle: 'Признаки синтетического происхождения',
    level: { high: 'Высокие', medium: 'Средние', low: 'Низкие' },
    levelText: {
      high: 'Есть сильные улики генерации (метки источника, параметры генератора) или несколько согласованных признаков.',
      medium: 'Есть отдельные признаки, но их недостаточно для уверенного вывода. Проверьте источник картинки.',
      low: 'Явных признаков генерации не найдено. Это не доказательство подлинности: метаданные легко удалить, а новые генераторы классификатор может не узнать.',
    },
    evidence: 'Улики', dir: { ai: 'за ИИ', real: 'против ИИ', neutral: 'к сведению' },
    ela: 'ELA-карта (ошибка повторного сжатия)', elaNote: 'Однородная «зернистость» — норма. Ярко выделенные участки с резкими границами могут означать вставку или локальную правку. Интерпретируйте осторожно: текст, края и шум тоже светятся.',
    showEla: 'Показать ELA', hideEla: 'Скрыть ELA', params: 'Параметры генерации из файла',
    disclaimer: 'Ни один инструмент не может достоверно определить ИИ по пикселям. Не используйте результат как обвинение автора — только как повод проверить источник.',
    ev: {
      c2paAi: ['Content Credentials (C2PA / IPTC): источник — генеративная модель', 'Файл сам заявляет о синтетическом происхождении. Это самая надёжная улика.'],
      c2paCapture: ['Content Credentials: снимок с камеры', 'Метка подлинности, её ставят камеры и приложения с поддержкой C2PA.'],
      c2paPresent: ['Есть C2PA-манифест', 'Файл несёт историю создания/правок; метки ИИ в нём не найдено.'],
      generator: ['Метаданные генератора', 'В файле найдены следы генератора/его параметров.'],
      camera: ['Камерный EXIF', 'Слабая улика: EXIF можно подделать, а у настоящих фото после мессенджеров он пропадает.'],
      software: ['Программа', 'Файл сохранён или обработан в этой программе. Само по себе ничего не доказывает.'],
      inconsistent: ['Несостыковки метаданных', ''],
      genSize: ['Размер типичен для генераторов', 'Такие размеры по умолчанию выдают популярные нейросети. Слабая улика.'],
      mult64: ['Стороны кратны 64', 'Частая особенность генерации, но встречается и у обычных картинок. Очень слабо.'],
      jpegQ: ['JPEG', ''],
      noMeta: ['Метаданных нет', 'Мессенджеры, соцсети и скриншоты их удаляют. Это не улика ни в одну сторону.'],
      classifier: ['Нейро-классификатор (обучен на SDXL)', 'Может не узнать Flux, Midjourney, GPT Image и другие новые генераторы, а на сильно сжатых фото ошибается.'],
      classifierSpread: ['Классификатор противоречит сам себе', 'На разных фрагментах изображения ответы сильно отличаются — его мнению доверять нельзя.'],
    },
    cls: { strongAi: 'уверенно склоняется к ИИ', leanAi: 'слегка склоняется к ИИ', strongReal: 'уверенно склоняется к фото', leanReal: 'слегка склоняется к фото', unsure: 'не уверен' },
    inc: { dates: 'дата изменения сильно позже даты съёмки', dims: 'размер в EXIF не совпадает с реальным (кадрировали/масштабировали)', noExposure: 'камера указана, но нет параметров съёмки' },
    jpeg: (q) => `качество ≈ ${q.quality}${q.standard ? ', стандартные таблицы (типично для редакторов/сервисов)' : ', нестандартные таблицы (типично для камер и телефонов)'}`,
  },
  en: {
    drop: 'Upload an image', hint: 'Use the original file — screenshots and forwarded photos lose metadata',
    change: 'Another image', analyzing: 'Reading metadata…', loadingModel: 'Loading classifier…', classifying: 'Classifier: several crops…',
    runModel: 'Run the neural classifier', modelNote: 'The model is ~350 MB, downloads once and is cached by the browser.',
    verdictTitle: 'Signs of synthetic origin',
    level: { high: 'High', medium: 'Medium', low: 'Low' },
    levelText: {
      high: 'There is strong evidence of generation (source labels, generator parameters) or several consistent signs.',
      medium: 'Some signs are present, but not enough for a confident conclusion. Check where the image came from.',
      low: 'No clear signs of generation found. That does not prove authenticity: metadata is easy to strip, and the classifier may not know newer generators.',
    },
    evidence: 'Evidence', dir: { ai: 'for AI', real: 'against AI', neutral: 'for reference' },
    ela: 'ELA map (recompression error)', elaNote: 'Uniform grain is normal. Bright areas with sharp borders may indicate a paste or local edit. Interpret with care: text, edges and noise glow too.',
    showEla: 'Show ELA', hideEla: 'Hide ELA', params: 'Generation parameters from the file',
    disclaimer: 'No tool can reliably detect AI from pixels alone. Do not use the result to accuse an artist — only as a reason to check the source.',
    ev: {
      c2paAi: ['Content Credentials (C2PA / IPTC): source is a generative model', 'The file itself declares synthetic origin. This is the strongest evidence.'],
      c2paCapture: ['Content Credentials: camera capture', 'An authenticity label written by C2PA-enabled cameras and apps.'],
      c2paPresent: ['C2PA manifest present', 'The file carries a creation/edit history; no AI label was found in it.'],
      generator: ['Generator metadata', 'Traces of a generator or its parameters were found in the file.'],
      camera: ['Camera EXIF', 'Weak evidence: EXIF can be forged, and real photos lose it after messengers.'],
      software: ['Software', 'The file was saved or processed in this app. Proves nothing by itself.'],
      inconsistent: ['Metadata inconsistencies', ''],
      genSize: ['Size typical of generators', 'Popular models output these sizes by default. Weak evidence.'],
      mult64: ['Sides are multiples of 64', 'Common in generated images, but ordinary images have it too. Very weak.'],
      jpegQ: ['JPEG', ''],
      noMeta: ['No metadata', 'Messengers, social networks and screenshots strip it. Not evidence either way.'],
      classifier: ['Neural classifier (trained on SDXL)', 'May not recognise Flux, Midjourney, GPT Image and other newer generators, and errs on heavily compressed photos.'],
      classifierSpread: ['The classifier contradicts itself', 'Answers differ a lot between crops — its opinion cannot be trusted.'],
    },
    cls: { strongAi: 'strongly leans AI', leanAi: 'slightly leans AI', strongReal: 'strongly leans photo', leanReal: 'slightly leans photo', unsure: 'unsure' },
    inc: { dates: 'modify date is much later than capture date', dims: 'EXIF size differs from the real one (cropped/resized)', noExposure: 'camera is named but shooting parameters are missing' },
    jpeg: (q) => `quality ≈ ${q.quality}${q.standard ? ', standard tables (typical for editors/services)' : ', custom tables (typical for cameras and phones)'}`,
  },
};

let clsPromise = null;
async function getClassifier(onProgress) {
  if (clsPromise) return clsPromise;
  clsPromise = (async () => {
    const lib = await import('@huggingface/transformers');
    lib.env.allowLocalModels = false;
    let device = 'wasm';
    try { if (typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter()) device = 'webgpu'; } catch { /* wasm */ }
    // В репозитории модели есть только fp32 (onnx/model.onnx) — без явного dtype на WASM
    // transformers.js ищет несуществующий model_quantized.onnx и падает.
    return lib.pipeline('image-classification', MODEL_ID, { device, dtype: 'fp32', progress_callback: onProgress });
  })().catch((e) => { clsPromise = null; throw e; });
  return clsPromise;
}

async function aiProb(cls, src) {
  const out = await cls(src, { top_k: 5 });
  const ai = out.find((o) => /art|ai|fake|generat|synth/i.test(o.label));
  if (ai) return ai.score;
  const real = out.find((o) => /real|human|photo|natur/i.test(o.label));
  return real ? 1 - real.score : 0.5;
}

function cropDataUrls(img) {
  const W = img.naturalWidth; const H = img.naturalHeight;
  const boxes = [[0, 0, W, H], [W * 0.15, H * 0.15, W * 0.7, H * 0.7], [0, 0, W * 0.6, H * 0.6], [W * 0.4, H * 0.4, W * 0.6, H * 0.6]];
  return boxes.map(([x, y, w, h]) => {
    const s = Math.min(1, 1024 / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  });
}

function AiDetector({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [meta, setMeta] = useState(null);
  const [classifier, setClassifier] = useState(null);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [ela, setEla] = useState('');
  const [showEla, setShowEla] = useState(false);

  async function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    const url = URL.createObjectURL(file);
    setSrcUrl(url); setMeta(null); setClassifier(null); setEla(''); setShowEla(false); setStatus('meta');
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      imgRef.current = img;
      setMeta(await inspectMetadata(file));
      setStatus('idle');
    } catch (e) { console.error(e); setStatus('error'); }
  }

  async function runClassifier() {
    if (!imgRef.current) return;
    try {
      setStatus('loading'); setProgress(0);
      const cls = await getClassifier((p) => { if (p && p.status === 'progress' && p.total) setProgress(Math.round((p.loaded / p.total) * 100)); });
      setStatus('processing');
      const probs = [];
      for (const c of cropDataUrls(imgRef.current)) probs.push(await aiProb(cls, c)); // eslint-disable-line no-await-in-loop
      const prob = probs.reduce((a, b) => a + b, 0) / probs.length;
      setClassifier({ prob, spread: Math.max(...probs) - Math.min(...probs) });
      setStatus('idle');
    } catch (e) { console.error(e); setStatus('error'); }
  }

  async function toggleEla() {
    if (!showEla && !ela && imgRef.current) setEla(await elaMap(imgRef.current));
    setShowEla((v) => !v);
  }

  const result = meta && imgRef.current ? buildEvidence({ meta, img: imgRef.current, classifier }) : null;
  const params = meta?.pngTexts.find((x) => /^(parameters|prompt|Dream|sd-metadata|invokeai_metadata|Description|Comment)$/i.test(x.key) && x.text.length > 10);
  const busy = status === 'loading' || status === 'processing' || status === 'meta';

  const evText = (e) => {
    const [title, detail] = t.ev[e.id];
    let value = e.value;
    if (e.id === 'classifier') value = t.cls[e.value];
    if (e.id === 'inconsistent') value = e.value.map((k) => t.inc[k]).join('; ');
    if (e.id === 'jpegQ') value = t.jpeg(e.value);
    return { title, detail, value };
  };

  return (
    <div className="tool-panel ai-detector bg-remover">
      {!srcUrl ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="aid-layout">
            <div className="aid-image">
              <img src={showEla && ela ? ela : srcUrl} alt="" className="bgr-img" />
              {showEla && <p className="tool-local-note">{t.elaNote}</p>}
            </div>

            <div className="aid-side">
              {result && (
                <div className={`aid-verdict is-${result.level}`}>
                  <span className="aid-verdict-title">{t.verdictTitle}</span>
                  <span className="aid-label">{t.level[result.level]}</span>
                  <span className="aid-verdict-text">{t.levelText[result.level]}</span>
                </div>
              )}

              {busy && (
                <div className="bgr-progress">
                  <span>{status === 'meta' ? t.analyzing : status === 'loading' ? `${t.loadingModel} ${progress ? `${progress}%` : ''}` : t.classifying}</span>
                  <div className="bgr-bar"><div className="bgr-bar-fill" style={{ width: `${status === 'loading' ? progress : 100}%` }} /></div>
                </div>
              )}
              {status === 'error' && <p className="color-invalid">{aiErrorHint(language)}</p>}

              <div className="tool-actions">
                {!classifier && <button type="button" className="tool-btn primary" onClick={runClassifier} disabled={busy}>{t.runModel}</button>}
                <button type="button" className="tool-btn" onClick={toggleEla} disabled={busy}>{showEla ? t.hideEla : t.showEla}</button>
                <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()} disabled={busy}>{t.change}</button>
              </div>
              {!classifier && <p className="tool-local-note">{t.modelNote}</p>}
            </div>
          </div>

          {result && (
            <>
              <h3 className="pe-h">{t.evidence}</h3>
              <ul className="aid-evidence">
                {result.evidence.map((e, i) => {
                  const x = evText(e);
                  return (
                    <li key={`${e.id}-${i}`} className={`aid-ev is-${e.dir}`}>
                      <span className="aid-ev-dir">{t.dir[e.dir]}</span>
                      <div>
                        <strong>{x.title}{x.value ? `: ${x.value}` : ''}</strong>
                        {x.detail && <p>{x.detail}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {params && (
            <details className="aid-params">
              <summary>{t.params} ({params.key})</summary>
              <pre>{params.text.slice(0, 4000)}</pre>
            </details>
          )}
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      {aiBrowserHint(language) && <p className="tool-local-note aid-warn">⚠️ {aiBrowserHint(language)}</p>}
      <p className="tool-local-note">⚖️ {t.disclaimer}</p>
    </div>
  );
}

export default AiDetector;
