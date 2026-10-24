import { useEffect, useRef, useState } from 'react';
import { aiBrowserHint, aiErrorHint } from '../../utils/aiSupport';
import CompareSlider from './shared/CompareSlider';
import {
  hasWebGpu, toWorkCanvas, loadVetorManifest, restoreClassic, restoreVetor, releaseAll, CLASSIC_MODELS, VETOR_STAGES,
} from '../../utils/photoRestore';

// Реставрация старых фото, два режима.
//  • «Классический»: открытые модели — YuNet находит лица, RestoreFormer++ восстанавливает каждое лицо, Real-ESRGAN ×4 увеличивает кадр.
//  • «Vetor Restore»: наша собственная связка (текстура → повреждения → достройка → лица → раскраска), сейчас обучается:
//    пока веса не опубликованы (public/models/restore/vetor-restore.json), режим показывает состояние обучения.
// Всё считается на устройстве посетителя (onnxruntime-web), снимок никуда не отправляется.

const TEXT = {
  ru: {
    modeLabel: 'Режим',
    classic: 'Классический', classicDesc: 'Открытые модели: RestoreFormer++ чинит лица, Real-ESRGAN ×4 увеличивает кадр. Уже работает.', classicTag: 'готов',
    vetor: 'Vetor Restore', vetorDesc: 'Наша нейросеть для старых фото: царапины, заломы, выцветание, потерянные куски, лица и раскраска.', vetorTag: 'в обучении', vetorReady: 'бета',
    drop: 'Загрузите старое фото', hint: 'JPG, PNG, WebP — обрабатывается на вашем устройстве',
    faces: 'Восстановить лица', faceStrength: 'Сила для лиц', keepColor: 'Сохранить цвет исходника на лицах',
    upscale: 'Увеличить кадр ×4', upAuto: 'Авто (если лиц нет)', upOn: 'Всегда', upOff: 'Нет',
    upBig: (m) => `Кадр больше ${m} px по длинной стороне — увеличение ×4 пропущено${m < 512 ? ' (на процессоре оно занимает минуты даже для маленьких кадров; на видеокарте лимит выше)' : ' (результат вышел бы огромным)'}.`,
    strength: 'Общая сила', texture: 'Шум и зерно', repair: 'Царапины, заломы, пятна', inpaint: 'Достроить потерянные места', colorize: 'Раскрасить чёрно-белое',
    colAuto: 'Авто', colOn: 'Всегда', colOff: 'Нет',
    run: 'Восстановить', cancel: 'Отменить', download: 'Скачать PNG', change: 'Другое фото', original: 'Оригинал', result: 'Результат',
    st: {
      detect: 'Ищу лица…', 'faces-load': 'Загрузка модели лиц…', faces: (i) => `Восстанавливаю лица${i?.count ? ` (${i.count})` : ''}…`,
      'upscale-load': 'Загрузка Real-ESRGAN…', upscale: 'Увеличиваю кадр…', 'texture-load': 'Загрузка сети текстуры…', texture: 'Убираю шум и зерно…',
      'repair-load': 'Загрузка сети повреждений…', repair: 'Убираю повреждения…', inpaint: 'Достраиваю потерянные места…', 'colorize-load': 'Загрузка раскраски…', colorize: 'Раскрашиваю…',
    },
    dl: 'скачано', cancelled: 'Отменено.',
    noFaces: 'Лица не найдены — восстановление лиц пропущено.', done: (i) => `Готово${i.faces ? ` · лиц: ${i.faces}` : ''}${i.upscaled ? ' · увеличено ×4' : ''}${i.colorized ? ' · раскрашено' : ''}`,
    scaled: (m) => `Фото уменьшено до ${m} px по длинной стороне — иначе браузер не потянет.`,
    gpuYes: 'WebGPU найден — обработка будет быстрой.', gpuNo: 'WebGPU не найден — всё пойдёт на процессоре и займёт заметно больше времени. Для скорости откройте страницу в Chrome или Edge.',
    firstLoad: `При первом запуске скачиваются модели (лица ~${CLASSIC_MODELS.faces.mb} МБ, увеличение ~${CLASSIC_MODELS.esrganFp16.mb}–${CLASSIC_MODELS.esrganFp32.mb} МБ), дальше берутся из кэша браузера.`,
    local: 'Фото не покидает ваше устройство.',
    training: 'Модели Vetor Restore ещё обучаются', trainingBody: 'Мы учим собственные сети на старых и испорченных фото из открытых источников. Как только веса будут готовы, этот режим включится сам — здесь же, без обновления страницы. Пока используйте «Классический».',
    pipeline: 'Как будет работать конвейер', stageNames: { texture: 'Текстура', repair: 'Повреждения', inpaint: 'Достройка', faces: 'Лица', colorize: 'Раскраска' },
    stageDesc: {
      texture: 'Убирает шум, зерно, сетку растра и следы JPEG.', repair: 'Находит и убирает царапины, заломы, пятна, выцветание, определяет «потерянные» места.',
      inpaint: 'Достраивает места, где изображения уже нет, по соседним областям.', faces: 'Находит лица, выравнивает, восстанавливает и мягко вклеивает обратно.', colorize: 'Для чёрно-белых снимков: яркость остаётся оригинальной, добавляется только цвет.',
    },
    waiting: 'ждёт обучения', haveNet: 'готово',
    about: 'О моделях и лицензиях',
    aboutBody: 'Классический режим повторяет типовую схему онлайн-реставраторов: YuNet (OpenCV Zoo, MIT) находит лица, RestoreFormer++ (Wang и др., Apache-2.0) восстанавливает каждое выровненное лицо, Real-ESRGAN (xinntao, BSD-3-Clause) увеличивает кадр. ONNX-версии моделей публикует сообщество FaceFusion на Hugging Face. Vetor Restore — наши собственные сети (NAFNet-архитектура, ResNet-UNet для цвета), обученные на данных с открытыми лицензиями.',
    expert: 'Не устроил результат нейросети? Старое фото можно доверить специалисту — напишите в Telegram:',
    aboutNote: 'Результат — вероятностная дорисовка: на сильно повреждённых лицах нейросеть может придумать черты, которых не было. Для документов и архива сохраняйте оригинал.',
  },
  en: {
    modeLabel: 'Mode',
    classic: 'Classic', classicDesc: 'Open models: RestoreFormer++ fixes faces, Real-ESRGAN ×4 upscales the frame. Works now.', classicTag: 'ready',
    vetor: 'Vetor Restore', vetorDesc: 'Our own network for old photos: scratches, creases, fading, lost areas, faces and colorization.', vetorTag: 'training', vetorReady: 'beta',
    drop: 'Upload an old photo', hint: 'JPG, PNG, WebP — processed on your device',
    faces: 'Restore faces', faceStrength: 'Face strength', keepColor: 'Keep the original color on faces',
    upscale: 'Upscale the frame ×4', upAuto: 'Auto (if no faces)', upOn: 'Always', upOff: 'No',
    upBig: (m) => `The frame is larger than ${m} px on its long side — ×4 upscaling was skipped${m < 512 ? ' (on the CPU it takes minutes even for small frames; with a GPU the limit is higher)' : ' (the result would be huge)'}.`,
    strength: 'Overall strength', texture: 'Noise and grain', repair: 'Scratches, creases, stains', inpaint: 'Fill in lost areas', colorize: 'Colorize black-and-white',
    colAuto: 'Auto', colOn: 'Always', colOff: 'No',
    run: 'Restore', cancel: 'Cancel', download: 'Download PNG', change: 'Another photo', original: 'Original', result: 'Result',
    st: {
      detect: 'Looking for faces…', 'faces-load': 'Loading the face model…', faces: (i) => `Restoring faces${i?.count ? ` (${i.count})` : ''}…`,
      'upscale-load': 'Loading Real-ESRGAN…', upscale: 'Upscaling the frame…', 'texture-load': 'Loading the texture net…', texture: 'Removing noise and grain…',
      'repair-load': 'Loading the damage net…', repair: 'Removing damage…', inpaint: 'Filling in lost areas…', 'colorize-load': 'Loading colorization…', colorize: 'Colorizing…',
    },
    dl: 'downloaded', cancelled: 'Cancelled.',
    noFaces: 'No faces found — face restoration skipped.', done: (i) => `Done${i.faces ? ` · faces: ${i.faces}` : ''}${i.upscaled ? ' · upscaled ×4' : ''}${i.colorized ? ' · colorized' : ''}`,
    scaled: (m) => `The photo was scaled down to ${m} px on its long side — the browser could not handle more.`,
    gpuYes: 'WebGPU detected — processing will be fast.', gpuNo: 'WebGPU not found — everything runs on the CPU and takes much longer. For speed open the page in Chrome or Edge.',
    firstLoad: `The first run downloads the models (faces ~${CLASSIC_MODELS.faces.mb} MB, upscaling ~${CLASSIC_MODELS.esrganFp16.mb}–${CLASSIC_MODELS.esrganFp32.mb} MB); later they come from the browser cache.`,
    local: 'The photo never leaves your device.',
    training: 'Vetor Restore models are still training', trainingBody: 'We are training our own networks on old and damaged photos from open sources. As soon as the weights are ready, this mode switches on by itself — right here, no page reload. Until then, use “Classic”.',
    pipeline: 'How the pipeline will work', stageNames: { texture: 'Texture', repair: 'Damage', inpaint: 'Fill-in', faces: 'Faces', colorize: 'Colorize' },
    stageDesc: {
      texture: 'Removes noise, grain, halftone screens and JPEG traces.', repair: 'Finds and removes scratches, creases, stains and fading, and detects “lost” areas.',
      inpaint: 'Fills in places where the image is gone, using neighboring areas.', faces: 'Finds faces, aligns, restores and softly blends them back.', colorize: 'For black-and-white shots: the luminance stays original, only color is added.',
    },
    waiting: 'waiting for training', haveNet: 'ready',
    about: 'About the models and licenses',
    aboutBody: 'Classic mode follows the typical online-restorer scheme: YuNet (OpenCV Zoo, MIT) finds faces, RestoreFormer++ (Wang et al., Apache-2.0) restores every aligned face, Real-ESRGAN (xinntao, BSD-3-Clause) upscales the frame. ONNX versions of the models are published by the FaceFusion community on Hugging Face. Vetor Restore is our own networks (NAFNet architecture, ResNet-UNet for color) trained on openly licensed data.',
    expert: 'Not happy with the network’s result? You can hand the photo to a specialist — message on Telegram:',
    aboutNote: 'The result is a probabilistic reconstruction: on badly damaged faces the network may invent features that were not there. For documents and archives keep the original.',
  },
};

const VETOR_KEYS = { texture: 'texture', repair: 'repair', inpaint: 'repair', faces: 'faces', colorize: 'colorize' };

function PhotoRestore({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const workRef = useRef(null);
  const stopRef = useRef(false);
  const [mode, setMode] = useState('classic');
  const [srcUrl, setSrcUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [resultSize, setResultSize] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | busy | done | error | cancelled
  const [stage, setStage] = useState(null);
  const [progress, setProgress] = useState(0);
  const [dl, setDl] = useState(0);
  const [info, setInfo] = useState(null);
  const [scaledTo, setScaledTo] = useState(0);
  const [gpu, setGpu] = useState(null);
  const [man, setMan] = useState(null);
  // классический
  const [faces, setFaces] = useState(true);
  const [faceStrength, setFaceStrength] = useState(100);
  const [keepColor, setKeepColor] = useState(true);
  const [upscale, setUpscale] = useState('auto');
  // vetor
  const [strength, setStrength] = useState(100);
  const [on, setOn] = useState({ texture: true, repair: true, inpaint: true, faces: true });
  const [color, setColor] = useState('auto');

  useEffect(() => {
    hasWebGpu().then(setGpu);
    // манифест нашей модели: пока weights не опубликованы, режим «в обучении». ?vr-manifest=/путь — только тот же сайт (для проверки новых весов).
    let url;
    try { const q = new URLSearchParams(window.location.search).get('vr-manifest'); if (q && q.startsWith('/') && !q.startsWith('//')) url = q; } catch { /* */ }
    loadVetorManifest(url).then(setMan);
    return () => { releaseAll(); };
  }, []);

  const have = (k) => !!man?.nets?.[VETOR_KEYS[k]];
  const vetorReady = !!man && man.status === 'ready' && Object.keys(man.nets).length > 0;
  const busy = status === 'busy';

  async function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    imgRef.current = img; workRef.current = null;
    setSrcUrl(url); setResultUrl(''); setResultSize(null); setStatus('idle'); setInfo(null);
  }

  async function run() {
    if (!imgRef.current) return;
    stopRef.current = false; setResultUrl(''); setInfo(null); setStatus('busy'); setProgress(0); setDl(0); setStage(null);
    const hooks = {
      onStage: (s, i) => { setStage({ s, i }); setProgress(0); setDl(0); },
      onProgress: setProgress, onDownload: (g, tot) => setDl(tot ? g / tot : 0), shouldStop: () => stopRef.current,
    };
    try {
      const maxSide = mode === 'vetor' ? 3000 : 4096;
      const { canvas, scaled } = toWorkCanvas(imgRef.current, maxSide);
      setScaledTo(scaled ? maxSide : 0);
      let res;
      if (mode === 'classic') {
        res = await restoreClassic(canvas, { faces, faceStrength: faceStrength / 100, keepColor, upscale }, hooks);
      } else {
        res = await restoreVetor(canvas, man, {
          strength: strength / 100, texture: on.texture, repair: on.repair, inpaint: on.inpaint, faces: on.faces, faceStrength: strength / 100, color,
        }, hooks);
      }
      const blob = await new Promise((r) => res.canvas.toBlob(r, 'image/png'));
      setResultUrl(URL.createObjectURL(blob)); setResultSize({ w: res.canvas.width, h: res.canvas.height });
      setInfo(res.info); setStatus('done');
    } catch (e) {
      if (String(e.message) === 'stopped') { setStatus('cancelled'); return; }
      console.error(e); setStatus('error');
    } finally { setStage(null); }
  }

  function download() {
    const a = document.createElement('a');
    a.href = resultUrl; a.download = `restored-${mode === 'classic' ? 'classic' : 'vetor'}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  const stageText = stage ? (typeof t.st[stage.s] === 'function' ? t.st[stage.s](stage.i) : t.st[stage.s]) : '';
  const loading = stage && stage.s.endsWith('-load');
  const pct = Math.round((loading ? dl : progress) * 100);
  const img = imgRef.current;
  const size = (w, h) => `${w}×${h} px`;

  return (
    <div className="tool-panel bg-remover photo-restore">
      <div className="tool-field">
        <span className="tool-field-label">{t.modeLabel}</span>
        <div className="up-models pr-modes">
          <button type="button" className={mode === 'classic' ? 'up-model is-active' : 'up-model'} onClick={() => setMode('classic')} disabled={busy}>
            <b>{t.classic}</b><span>{t.classicDesc}</span><em>{t.classicTag}</em>
          </button>
          <button type="button" className={mode === 'vetor' ? 'up-model is-active' : 'up-model'} onClick={() => setMode('vetor')} disabled={busy}>
            <b>{t.vetor}</b><span>{t.vetorDesc}</span><em>{vetorReady ? t.vetorReady : t.vetorTag}</em>
          </button>
        </div>
      </div>

      {mode === 'classic' && (
        <div className="pr-opts">
          <label className="pg-check"><input type="checkbox" checked={faces} onChange={(e) => setFaces(e.target.checked)} disabled={busy} /> {t.faces}</label>
          {faces && (
            <div className="tool-field">
              <span className="tool-field-label">{t.faceStrength}: {faceStrength}%</span>
              <input type="range" min="0" max="100" value={faceStrength} onChange={(e) => setFaceStrength(Number(e.target.value))} disabled={busy} />
              <label className="pg-check"><input type="checkbox" checked={keepColor} onChange={(e) => setKeepColor(e.target.checked)} disabled={busy} /> {t.keepColor}</label>
            </div>
          )}
          <div className="tool-field">
            <span className="tool-field-label">{t.upscale}</span>
            <div className="segmented">
              {[['auto', t.upAuto], ['on', t.upOn], ['off', t.upOff]].map(([k, l]) => (
                <button key={k} type="button" className={`segmented-btn${upscale === k ? ' is-active' : ''}`} onClick={() => setUpscale(k)} disabled={busy}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode === 'vetor' && !vetorReady && (
        <div className="pr-training" role="status">
          <h3>{t.training}</h3>
          <p>{t.trainingBody}</p>
          <span className="tool-field-label">{t.pipeline}</span>
          <ol className="pr-stages">
            {VETOR_STAGES.map((k) => (
              <li key={k} className={have(k) ? 'is-ready' : ''}>
                <b>{t.stageNames[k]}</b><span>{t.stageDesc[k]}</span><em>{have(k) ? t.haveNet : t.waiting}</em>
              </li>
            ))}
          </ol>
        </div>
      )}

      {mode === 'vetor' && vetorReady && (
        <div className="pr-opts">
          <div className="tool-field">
            <span className="tool-field-label">{t.strength}: {strength}%</span>
            <input type="range" min="0" max="100" value={strength} onChange={(e) => setStrength(Number(e.target.value))} disabled={busy} />
          </div>
          {['texture', 'repair', 'inpaint', 'faces'].filter(have).map((k) => (
            <label key={k} className="pg-check"><input type="checkbox" checked={on[k]} onChange={(e) => setOn({ ...on, [k]: e.target.checked })} disabled={busy} /> {t[k] || t.faces}</label>
          ))}
          {have('colorize') && (
            <div className="tool-field">
              <span className="tool-field-label">{t.colorize}</span>
              <div className="segmented">
                {[['auto', t.colAuto], ['on', t.colOn], ['off', t.colOff]].map(([k, l]) => (
                  <button key={k} type="button" className={`segmented-btn${color === k ? ' is-active' : ''}`} onClick={() => setColor(k)} disabled={busy}>{l}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!srcUrl ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          {scaledTo > 0 && <p className="tool-local-note">⚠️ {t.scaled(scaledTo)}</p>}
          {resultUrl ? (
            <CompareSlider before={srcUrl} after={resultUrl} language={language} beforeLabel={`${t.original} ${img ? size(img.naturalWidth, img.naturalHeight) : ''}`} afterLabel={`${t.result} ${resultSize ? size(resultSize.w, resultSize.h) : ''}`} />
          ) : (
            <div className="bgr-compare"><div className="bgr-cell"><span className="bgr-cap">{t.original} {img ? size(img.naturalWidth, img.naturalHeight) : ''}</span><img src={srcUrl} alt="" className="bgr-img" /></div></div>
          )}

          {busy && (
            <div className="bgr-progress" role="status">
              <span>{stageText || '…'} {pct > 0 ? `${pct}%` : ''}{loading && dl > 0 ? ` ${t.dl}` : ''}</span>
              <div className="bgr-bar"><div className="bgr-bar-fill" style={{ width: `${pct}%` }} /></div>
            </div>
          )}
          {status === 'error' && <p className="color-invalid" role="alert">{aiErrorHint(language)}</p>}
          {status === 'cancelled' && <p className="tool-local-note">{t.cancelled}</p>}
          {status === 'done' && info && (
            <>
              <p className="tool-local-note">✅ {t.done(info)}</p>
              {mode === 'classic' && faces && info.faces === 0 && <p className="tool-local-note">{t.noFaces}</p>}
              {info.skippedUpscale && <p className="tool-local-note">⚠️ {t.upBig(info.skippedUpscale)}</p>}
            </>
          )}

          <div className="tool-actions">
            {!busy && <button type="button" className="tool-btn primary" onClick={run} disabled={mode === 'vetor' && !vetorReady}>{t.run}</button>}
            {busy && <button type="button" className="tool-btn" onClick={() => { stopRef.current = true; }}>{t.cancel}</button>}
            {resultUrl && <button type="button" className="tool-btn primary" onClick={download}>{t.download}</button>}
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()} disabled={busy}>{t.change}</button>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      {aiBrowserHint(language) && <p className="tool-local-note aid-warn">⚠️ {aiBrowserHint(language)}</p>}
      {gpu !== null && <p className="tool-local-note">{gpu ? t.gpuYes : t.gpuNo}</p>}
      {mode === 'classic' && <p className="tool-local-note">{t.firstLoad}</p>}
      <p className="tool-local-note">🔒 {t.local}</p>
      {srcUrl && <p className="tool-local-note pr-expert">{t.expert} <a href="https://t.me/felwory" target="_blank" rel="noopener noreferrer">@felwory</a></p>}

      <details className="pg-about">
        <summary>{t.about}</summary>
        <p>{t.aboutBody}</p>
        <p>{t.aboutNote}</p>
      </details>
    </div>
  );
}

export default PhotoRestore;
