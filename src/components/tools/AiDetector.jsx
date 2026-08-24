import { useRef, useState } from 'react';
import { cleanImageMetadata } from '../../utils/imageMeta';
import { aiBrowserHint, aiErrorHint } from '../../utils/aiSupport';

// Детектор AI-изображений. Углублённая проверка: нейро-классификатор
// (Organika/sdxl-detector) усредняется по нескольким кропам + сигналы из
// метаданных (C2PA-метки ИИ, наличие камерного EXIF). Всё локально в браузере.

const MODEL_ID = 'Organika/sdxl-detector';

const TEXT = {
  ru: {
    drop: 'Загрузите изображение', hint: 'PNG, JPG, WebP — обрабатывается локально',
    run: 'Проверить', loadingModel: 'Загрузка модели…', processing: 'Анализ (несколько проходов)…',
    change: 'Другое', ai: 'Похоже на ИИ', real: 'Похоже на настоящее', mixed: 'Неоднозначно',
    confidence: 'Оценка ИИ', signals: 'Сигналы',
    sC2PA: 'C2PA-метка ИИ в метаданных', sExif: 'камерный EXIF (обычно у настоящих фото)', sModel: 'нейро-классификатор',
    note: 'Оценка вероятностная — не абсолютная истина. Первый запуск скачает модель.',
  },
  en: {
    drop: 'Upload an image', hint: 'PNG, JPG, WebP — processed locally',
    run: 'Check', loadingModel: 'Loading model…', processing: 'Analyzing (multiple passes)…',
    change: 'Another', ai: 'Looks AI-generated', real: 'Looks real', mixed: 'Inconclusive',
    confidence: 'AI score', signals: 'Signals',
    sC2PA: 'C2PA AI marker in metadata', sExif: 'camera EXIF (usual for real photos)', sModel: 'neural classifier',
    note: 'The result is probabilistic — not absolute truth. The first run downloads the model.',
  },
};

let clsPromise = null;
async function getClassifier(onProgress) {
  if (clsPromise) return clsPromise;
  clsPromise = (async () => {
    const lib = await import('@huggingface/transformers');
    lib.env.allowLocalModels = false;
    let device;
    try { device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm'; } catch { device = 'wasm'; }
    return lib.pipeline('image-classification', MODEL_ID, { device, progress_callback: onProgress });
  })();
  return clsPromise;
}

// AI-вероятность одного прохода: score метки artificial/ai/fake/generated.
async function aiProb(cls, src) {
  const out = await cls(src, { top_k: 5 });
  const ai = out.find((o) => /art|ai|fake|generat|synth/i.test(o.label));
  if (ai) return ai.score;
  const real = out.find((o) => /real|human|photo|natur/i.test(o.label));
  return real ? 1 - real.score : 0.5;
}

// Кропы для усреднения: целое + центр + два угла.
function cropDataUrls(img) {
  const W = img.naturalWidth; const H = img.naturalHeight;
  const boxes = [
    [0, 0, W, H],
    [W * 0.15, H * 0.15, W * 0.7, H * 0.7],
    [0, 0, W * 0.6, H * 0.6],
    [W * 0.4, H * 0.4, W * 0.6, H * 0.6],
  ];
  return boxes.map(([x, y, w, h]) => {
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  });
}

function AiDetector({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    fileRef.current = file;
    setResult(null); setStatus('idle'); setSrcUrl(URL.createObjectURL(file));
  }

  async function run() {
    if (!srcUrl) return;
    try {
      setStatus('loading'); setProgress(0);
      const cls = await getClassifier((p) => { if (p && p.status === 'progress' && p.total) setProgress(Math.round((p.loaded / p.total) * 100)); });
      setStatus('processing');

      // Модель по нескольким кропам.
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = srcUrl; });
      const crops = cropDataUrls(img);
      const probs = [];
      for (const c of crops) { probs.push(await aiProb(cls, c)); } // eslint-disable-line no-await-in-loop
      let score = probs.reduce((a, b) => a + b, 0) / probs.length;

      // Сигналы из метаданных.
      const signals = [{ key: 'sModel', val: `${Math.round(score * 100)}%` }];
      try {
        const meta = cleanImageMetadata(await fileRef.current.arrayBuffer(), fileRef.current.type);
        if (meta) {
          const hasC2PA = meta.found.some((f) => /C2PA/i.test(f.type));
          const hasExif = meta.found.some((f) => /EXIF/i.test(f.type));
          if (hasC2PA) { score = Math.max(score, 0.85); signals.push({ key: 'sC2PA' }); }
          else if (hasExif) { score *= 0.75; signals.push({ key: 'sExif' }); }
        }
      } catch { /* метаданные не критичны */ }

      const verdict = score >= 0.6 ? 'ai' : score <= 0.4 ? 'real' : 'mixed';
      setResult({ score, verdict, signals });
      setStatus('done');
    } catch (e) { console.error(e); setStatus('error'); }
  }

  const busy = status === 'loading' || status === 'processing';

  return (
    <div className="tool-panel ai-detector bg-remover">
      {!srcUrl ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="bgr-compare"><div className="bgr-cell"><img src={srcUrl} alt="" className="bgr-img" /></div></div>

          {busy && (
            <div className="bgr-progress">
              <span>{status === 'loading' ? `${t.loadingModel} ${progress ? `${progress}%` : ''}` : t.processing}</span>
              <div className="bgr-bar"><div className="bgr-bar-fill" style={{ width: `${status === 'loading' ? progress : 100}%` }} /></div>
            </div>
          )}
          {status === 'error' && <p className="color-invalid">{aiErrorHint(language)}</p>}

          {result && (
            <>
              <div className={`aid-verdict is-${result.verdict}`}>
                <span className="aid-emoji">{result.verdict === 'ai' ? '🤖' : result.verdict === 'real' ? '📷' : '🤔'}</span>
                <span className="aid-label">{result.verdict === 'ai' ? t.ai : result.verdict === 'real' ? t.real : t.mixed}</span>
                <span className="aid-conf">{t.confidence}: {Math.round(result.score * 100)}%</span>
              </div>
              <div className="aid-signals">
                <span className="tool-field-label">{t.signals}:</span>
                {result.signals.map((s, i) => <span key={i} className="aid-sig">{t[s.key]}{s.val ? ` (${s.val})` : ''}</span>)}
              </div>
            </>
          )}

          <div className="tool-actions">
            {status !== 'done' && <button type="button" className="tool-btn primary" onClick={run} disabled={busy}>{busy ? '…' : t.run}</button>}
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()} disabled={busy}>{t.change}</button>
          </div>
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      {aiBrowserHint(language) && <p className="tool-local-note aid-warn">⚠️ {aiBrowserHint(language)}</p>}
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default AiDetector;
