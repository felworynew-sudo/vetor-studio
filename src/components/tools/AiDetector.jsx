import { useRef, useState } from 'react';

// Детектор AI-изображений: классификатор Organika/sdxl-detector (ONNX) в браузере
// через transformers.js. Модель скачивается один раз. Оценка — вероятностная,
// не абсолютная истина.

const MODEL_ID = 'Organika/sdxl-detector';

const TEXT = {
  ru: {
    drop: 'Загрузите изображение', hint: 'PNG, JPG, WebP — обрабатывается локально',
    run: 'Проверить', loadingModel: 'Загрузка модели…', processing: 'Анализ…',
    change: 'Другое', ai: 'Похоже на ИИ', real: 'Похоже на настоящее', confidence: 'Уверенность',
    note: 'Первый запуск скачает модель. Результат вероятностный — не считайте за 100% истину.',
    error: 'Не удалось обработать. Попробуйте другой файл или браузер на Chromium.',
  },
  en: {
    drop: 'Upload an image', hint: 'PNG, JPG, WebP — processed locally',
    run: 'Check', loadingModel: 'Loading model…', processing: 'Analyzing…',
    change: 'Another', ai: 'Looks AI-generated', real: 'Looks real', confidence: 'Confidence',
    note: 'The first run downloads the model. The result is probabilistic — not absolute truth.',
    error: 'Could not process. Try another file or a Chromium browser.',
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

function AiDetector({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setResult(null); setStatus('idle'); setSrcUrl(URL.createObjectURL(file));
  }

  async function run() {
    if (!srcUrl) return;
    try {
      setStatus('loading'); setProgress(0);
      const cls = await getClassifier((p) => { if (p && p.status === 'progress' && p.total) setProgress(Math.round((p.loaded / p.total) * 100)); });
      setStatus('processing');
      const out = await cls(srcUrl);
      // out: [{label, score}] — метки вида artificial/human (или ai/real).
      const top = out.reduce((a, b) => (b.score > a.score ? b : a));
      const isAi = /art|ai|fake|generat|synth/i.test(top.label);
      setResult({ isAi, score: top.score, label: top.label });
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
          <div className="bgr-compare">
            <div className="bgr-cell"><img src={srcUrl} alt="" className="bgr-img" /></div>
          </div>

          {busy && (
            <div className="bgr-progress">
              <span>{status === 'loading' ? `${t.loadingModel} ${progress ? `${progress}%` : ''}` : t.processing}</span>
              <div className="bgr-bar"><div className="bgr-bar-fill" style={{ width: `${status === 'loading' ? progress : 100}%` }} /></div>
            </div>
          )}
          {status === 'error' && <p className="color-invalid">{t.error}</p>}

          {result && (
            <div className={result.isAi ? 'aid-verdict is-ai' : 'aid-verdict is-real'}>
              <span className="aid-emoji">{result.isAi ? '🤖' : '📷'}</span>
              <span className="aid-label">{result.isAi ? t.ai : t.real}</span>
              <span className="aid-conf">{t.confidence}: {Math.round(result.score * 100)}%</span>
            </div>
          )}

          <div className="tool-actions">
            {status !== 'done' && <button type="button" className="tool-btn primary" onClick={run} disabled={busy}>{busy ? '…' : t.run}</button>}
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()} disabled={busy}>{t.change}</button>
          </div>
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default AiDetector;
