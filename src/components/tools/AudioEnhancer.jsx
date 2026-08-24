import { useCallback, useRef, useState } from 'react';

// Улучшение аудио: шумовой гейт + high-pass (убрать гул) + компрессор +
// presence-EQ + нормализация громкости. Пакетно, локально через Web Audio.
// Выход — WAV (без потерь). Ничего не уходит на сервер.

const PRESETS = {
  voice: {
    ru: 'Голос / подкаст', en: 'Voice / podcast',
    hp: 90, compThresh: -24, compRatio: 3.5, presFreq: 3200, presGain: 3.5, presQ: 1, makeup: 1.15, gate: true,
  },
  music: {
    ru: 'Музыка (бережно)', en: 'Music (gentle)',
    hp: 32, compThresh: -18, compRatio: 2, presFreq: 5000, presGain: 1.5, presQ: 0.7, makeup: 1.05, gate: false,
  },
};

const TEXT = {
  ru: {
    drop: 'Перетащите аудио сюда или нажмите', hint: 'MP3, WAV, M4A, OGG — можно несколько файлов',
    preset: 'Пресет', denoise: 'Шумоподавление', normalize: 'Нормализация громкости',
    process: 'Улучшить всё', processing: 'Обработка…', download: 'Скачать', downloadAll: 'Скачать всё',
    clear: 'Очистить', empty: 'Пока нет файлов', local: 'Всё считается в браузере, файлы никуда не передаются.',
  },
  en: {
    drop: 'Drop audio here or click', hint: 'MP3, WAV, M4A, OGG — several files are fine',
    preset: 'Preset', denoise: 'Noise reduction', normalize: 'Loudness normalize',
    process: 'Enhance all', processing: 'Processing…', download: 'Download', downloadAll: 'Download all',
    clear: 'Clear', empty: 'No files yet', local: 'Everything runs in your browser, files are never uploaded.',
  },
};

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

// Оценка шумового порога: 15-й перцентиль RMS коротких кадров.
function estimateFloor(buffer) {
  const d = buffer.getChannelData(0);
  const frame = 1024;
  const rms = [];
  for (let i = 0; i + frame < d.length; i += frame) {
    let s = 0;
    for (let j = 0; j < frame; j += 1) s += d[i + j] * d[i + j];
    rms.push(Math.sqrt(s / frame));
  }
  if (rms.length === 0) return 0;
  rms.sort((a, b) => a - b);
  return rms[Math.floor(rms.length * 0.15)] || 0;
}

// Нисходящий экспандер (мягкий шумовой гейт) по каждому каналу.
function applyGate(buffer, floor) {
  const threshold = floor * 2.2;
  if (threshold <= 0) return;
  const sr = buffer.sampleRate;
  const aC = Math.exp(-1 / (sr * 0.005));
  const rC = Math.exp(-1 / (sr * 0.08));
  const reduction = 0.12;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const d = buffer.getChannelData(c);
    let env = 0; let gain = 1;
    for (let i = 0; i < d.length; i += 1) {
      const a = Math.abs(d[i]);
      env = a > env ? aC * env + (1 - aC) * a : rC * env + (1 - rC) * a;
      const target = env < threshold ? reduction : 1;
      gain = target < gain ? aC * gain + (1 - aC) * target : rC * gain + (1 - rC) * target;
      d[i] *= gain;
    }
  }
}

function normalizePeak(buffer, targetDb = -1) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i += 1) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  if (peak === 0) return;
  const target = 10 ** (targetDb / 20);
  const gain = Math.min(12, target / peak);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i += 1) d[i] *= gain;
  }
}

async function renderChain(buffer, preset) {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = ctx.createBufferSource(); src.buffer = buffer;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = preset.hp;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = preset.compThresh; comp.ratio.value = preset.compRatio;
  comp.attack.value = 0.003; comp.release.value = 0.25; comp.knee.value = 6;
  const pres = ctx.createBiquadFilter(); pres.type = 'peaking';
  pres.frequency.value = preset.presFreq; pres.gain.value = preset.presGain; pres.Q.value = preset.presQ;
  const makeup = ctx.createGain(); makeup.gain.value = preset.makeup;
  src.connect(hp); hp.connect(comp); comp.connect(pres); pres.connect(makeup); makeup.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

function encodeWAV(buffer) {
  const numCh = buffer.numberOfChannels; const sr = buffer.sampleRate; const len = buffer.length;
  const dataSize = len * numCh * 2;
  const ab = new ArrayBuffer(44 + dataSize); const dv = new DataView(ab);
  let p = 0;
  const wStr = (s) => { for (let i = 0; i < s.length; i += 1) { dv.setUint8(p, s.charCodeAt(i)); p += 1; } };
  const w32 = (v) => { dv.setUint32(p, v, true); p += 4; };
  const w16 = (v) => { dv.setUint16(p, v, true); p += 2; };
  wStr('RIFF'); w32(36 + dataSize); wStr('WAVE'); wStr('fmt '); w32(16); w16(1); w16(numCh);
  w32(sr); w32(sr * numCh * 2); w16(numCh * 2); w16(16); wStr('data'); w32(dataSize);
  const chans = [];
  for (let c = 0; c < numCh; c += 1) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i += 1) {
    for (let c = 0; c < numCh; c += 1) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      dv.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true); p += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

let sharedCtx = null;
function getCtx() {
  if (!sharedCtx) { const C = window.AudioContext || window.webkitAudioContext; sharedCtx = new C(); }
  return sharedCtx;
}

function AudioEnhancer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [preset, setPreset] = useState('voice');
  const [denoise, setDenoise] = useState(true);
  const [normalize, setNormalize] = useState(true);
  const [busy, setBusy] = useState(false);

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(f.name));
    if (!files.length) return;
    setItems((prev) => [...prev, ...files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, name: file.name, inSize: file.size, outUrl: '', outSize: 0, outName: '', status: 'idle' }))]);
  }, []);

  async function processOne(item) {
    const arrayBuf = await item.file.arrayBuffer();
    const decoded = await getCtx().decodeAudioData(arrayBuf.slice(0));
    // Копируем в рабочий буфер (decodeAudioData возвращает read-only в части браузеров).
    const work = getCtx().createBuffer(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
    for (let c = 0; c < decoded.numberOfChannels; c += 1) work.copyToChannel(decoded.getChannelData(c).slice(), c);
    if (denoise) applyGate(work, estimateFloor(work));
    const rendered = await renderChain(work, PRESETS[preset]);
    if (normalize) normalizePeak(rendered, -1);
    const blob = encodeWAV(rendered);
    const base = item.name.replace(/\.[^.]+$/, '');
    return { outUrl: URL.createObjectURL(blob), outSize: blob.size, outName: `${base}-enhanced.wav` };
  }

  async function processAll() {
    setBusy(true);
    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await processOne(item);
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...r, status: 'done' } : it)));
      } catch {
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
      }
    }
    setBusy(false);
  }

  function download(item) {
    const a = document.createElement('a');
    a.href = item.outUrl; a.download = item.outName;
    document.body.appendChild(a); a.click(); a.remove();
  }

  const doneCount = items.filter((it) => it.status === 'done').length;

  return (
    <div className="tool-panel audio-enhancer">
      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.preset}</span>
          <div className="segmented">
            {Object.entries(PRESETS).map(([k, v]) => (
              <button key={k} type="button" className={k === preset ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setPreset(k)}>{v[language] || v.ru}</button>
            ))}
          </div>
        </div>
        <label className="wm-check"><input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} />{t.denoise}</label>
        <label className="wm-check"><input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />{t.normalize}</label>
      </div>

      <button
        type="button"
        className="tool-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      {items.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={processAll} disabled={busy}>{busy ? t.processing : t.process}</button>
          {doneCount > 0 && <button type="button" className="tool-btn" onClick={() => items.filter((it) => it.outUrl).forEach((it, i) => setTimeout(() => download(it), i * 250))}>{t.downloadAll} ({doneCount})</button>}
          <button type="button" className="tool-btn ghost" onClick={() => setItems([])} disabled={busy}>{t.clear}</button>
        </div>
      )}

      <ul className="convert-list">
        {items.length === 0 && <li className="convert-empty">{t.empty}</li>}
        {items.map((item) => (
          <li key={item.id} className={`convert-row status-${item.status}`}>
            <span className="convert-name" title={item.name}>{item.name}</span>
            <span className="convert-sizes">
              {fmtBytes(item.inSize)}
              {item.status === 'done' && <> <span className="convert-arrow">→</span> <strong>{fmtBytes(item.outSize)}</strong></>}
            </span>
            {item.status === 'done' ? (
              <button type="button" className="tool-btn small" onClick={() => download(item)}>{t.download}</button>
            ) : item.status === 'error' ? <span className="convert-error">⚠</span> : <span className="convert-pending">•</span>}
          </li>
        ))}
      </ul>

      <input ref={inputRef} type="file" accept="audio/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.local}</p>
    </div>
  );
}

export default AudioEnhancer;
