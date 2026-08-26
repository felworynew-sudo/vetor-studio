import { useCallback, useRef, useState } from 'react';

// Улучшение аудио — цепочка профессиональных фильтров, как у аудио-энхансеров:
// эквализация (тепло/чёткость/воздух) → шумовой гейт → динамическая компрессия
// → де-эссер → нормализация громкости → лимитер (защита от клиппинга).
// Авто-пресеты и ручной режим. Пакетно, локально (Web Audio), выход WAV.

const PRESETS = {
  voice: {
    ru: 'Голос / подкаст', en: 'Voice / podcast',
    hp: 90, warmth: 2, clarity: 3.5, air: 2, compThresh: -24, compRatio: 3.5, gate: 0.6, deess: 0.35, targetRms: -16, ceiling: 0.95,
  },
  clarity: {
    ru: 'Голос — макс. чистота', en: 'Voice — max clarity',
    hp: 110, warmth: 1, clarity: 5, air: 3, compThresh: -28, compRatio: 4.5, gate: 0.8, deess: 0.5, targetRms: -15, ceiling: 0.95,
  },
  music: {
    ru: 'Музыка (бережно)', en: 'Music (gentle)',
    hp: 30, warmth: 1, clarity: 1.5, air: 1, compThresh: -18, compRatio: 2, gate: 0, deess: 0, targetRms: -15, ceiling: 0.98,
  },
};

const TEXT = {
  ru: {
    drop: 'Перетащите аудио сюда или нажмите', hint: 'MP3, WAV, M4A, OGG — можно несколько файлов',
    mode: 'Режим', auto: 'Авто', manual: 'Ручной', preset: 'Пресет',
    autoNote: 'Авто-режим сам определит тип каждого файла (голос / музыка) и подберёт обработку.',
    detected: 'Определено', before: 'До', after: 'После',
    warmth: 'Тепло (низ)', clarity: 'Чёткость (голос)', air: 'Воздух (верх)',
    compThresh: 'Порог компрессии', compRatio: 'Степень сжатия', gate: 'Шумовой порог', deess: 'Де-эссер', loud: 'Громкость',
    process: 'Улучшить всё', processing: 'Обработка…', download: 'Скачать', downloadAll: 'Скачать всё',
    clear: 'Очистить', empty: 'Пока нет файлов',
    local: 'Всё считается в браузере, файлы никуда не передаются. Выход — WAV без потерь.',
    chain: 'Эквализация → шумовой гейт → компрессор → де-эссер → нормализация → лимитер.',
  },
  en: {
    drop: 'Drop audio here or click', hint: 'MP3, WAV, M4A, OGG — several files are fine',
    mode: 'Mode', auto: 'Auto', manual: 'Manual', preset: 'Preset',
    autoNote: 'Auto mode detects each file’s type (voice / music) and picks the processing itself.',
    detected: 'Detected', before: 'Before', after: 'After',
    warmth: 'Warmth (low)', clarity: 'Clarity (voice)', air: 'Air (high)',
    compThresh: 'Compression threshold', compRatio: 'Compression ratio', gate: 'Noise gate', deess: 'De-esser', loud: 'Loudness',
    process: 'Enhance all', processing: 'Processing…', download: 'Download', downloadAll: 'Download all',
    clear: 'Clear', empty: 'No files yet',
    local: 'Everything runs in your browser, files are never uploaded. Output is lossless WAV.',
    chain: 'EQ → noise gate → compressor → de-esser → normalize → limiter.',
  },
};

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function estimateFloor(buffer) {
  const d = buffer.getChannelData(0);
  const frame = 1024; const rms = [];
  for (let i = 0; i + frame < d.length; i += frame) {
    let s = 0;
    for (let j = 0; j < frame; j += 1) s += d[i + j] * d[i + j];
    rms.push(Math.sqrt(s / frame));
  }
  if (!rms.length) return 0;
  rms.sort((a, b) => a - b);
  return rms[Math.floor(rms.length * 0.15)] || 0;
}

// Авто-определение типа записи: стереоширина (музыка шире), доля пауз (у речи
// больше), zero-crossing rate (шипящие/ВЧ). Возвращает ключ пресета.
function detectKind(buffer) {
  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const n = L.length;
  let width = 0;
  if (R) {
    let sLR = 0; let sLL = 0; let sRR = 0; const step = Math.max(1, Math.floor(n / 200000));
    for (let i = 0; i < n; i += step) { sLR += L[i] * R[i]; sLL += L[i] * L[i]; sRR += R[i] * R[i]; }
    const corr = sLR / (Math.sqrt(sLL * sRR) || 1);
    width = 1 - Math.max(0, Math.min(1, corr));
  }
  const frame = Math.floor(sr * 0.05); const rms = [];
  for (let i = 0; i + frame < n; i += frame) { let s = 0; for (let j = 0; j < frame; j += 1) s += L[i + j] * L[i + j]; rms.push(Math.sqrt(s / frame)); }
  const peak = rms.reduce((m, r) => (r > m ? r : m), 1e-6);
  const silenceRatio = rms.length ? rms.filter((r) => r < peak * 0.06).length / rms.length : 0;
  let zc = 0; let cnt = 0; const step = Math.max(1, Math.floor(n / 300000));
  for (let i = step; i < n; i += step) { if ((L[i] >= 0) !== (L[i - step] >= 0)) zc += 1; cnt += 1; }
  const zcr = zc / (cnt || 1);
  if (width > 0.28) return 'music';
  if (silenceRatio > 0.18) return 'voice';
  if (zcr > 0.09) return 'clarity';
  return 'voice';
}

function applyGate(buffer, floor, amount) {
  const threshold = floor * (1 + amount * 2.5);
  if (threshold <= 0 || amount <= 0) return;
  const sr = buffer.sampleRate;
  const aC = Math.exp(-1 / (sr * 0.005)); const rC = Math.exp(-1 / (sr * 0.08));
  const reduction = 1 - amount * 0.9;
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

async function renderChain(buffer, p) {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = ctx.createBufferSource(); src.buffer = buffer;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.hp;
  const warm = ctx.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 160; warm.gain.value = p.warmth;
  const clar = ctx.createBiquadFilter(); clar.type = 'peaking'; clar.frequency.value = 3000; clar.Q.value = 1; clar.gain.value = p.clarity;
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 10000; air.gain.value = p.air;
  const deess = ctx.createBiquadFilter(); deess.type = 'peaking'; deess.frequency.value = 6800; deess.Q.value = 3.2; deess.gain.value = -p.deess * 11;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = p.compThresh; comp.ratio.value = p.compRatio;
  comp.attack.value = 0.003; comp.release.value = 0.25; comp.knee.value = 6;
  src.connect(hp); hp.connect(warm); warm.connect(clar); clar.connect(air); air.connect(deess); deess.connect(comp); comp.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

function rmsOf(buffer) {
  let s = 0; let n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i += 1) s += d[i] * d[i];
    n += d.length;
  }
  return Math.sqrt(s / (n || 1));
}

// Нормализация к целевой громкости + линкованный лимитер (защита от клиппинга).
function normalizeAndLimit(buffer, targetRms, ceiling) {
  const measured = rmsOf(buffer);
  const gain = measured > 0 ? Math.min(16, (10 ** (targetRms / 20)) / measured) : 1;
  const sr = buffer.sampleRate;
  const aC = Math.exp(-1 / (sr * 0.001)); const rC = Math.exp(-1 / (sr * 0.05));
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) chans.push(buffer.getChannelData(c));
  let g = 1;
  for (let i = 0; i < buffer.length; i += 1) {
    let peak = 0;
    for (let c = 0; c < chans.length; c += 1) { const a = Math.abs(chans[c][i] * gain); if (a > peak) peak = a; }
    const need = peak > ceiling ? ceiling / peak : 1;
    g = need < g ? aC * g + (1 - aC) * need : rC * g + (1 - rC) * need;
    for (let c = 0; c < chans.length; c += 1) {
      chans[c][i] = Math.max(-1, Math.min(1, chans[c][i] * gain * g));
    }
  }
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
  const [mode, setMode] = useState('auto');
  const [manual, setManual] = useState({ ...PRESETS.voice });
  const [busy, setBusy] = useState(false);
  const [ab, setAb] = useState({ id: '', which: '' });
  const abRef = useRef(null);

  const setM = (k, v) => setManual((m) => ({ ...m, [k]: v }));

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(f.name));
    if (!files.length) return;
    setItems((prev) => [...prev, ...files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, name: file.name, inSize: file.size, outUrl: '', outSize: 0, outName: '', status: 'idle' }))]);
  }, []);

  async function processOne(item, autoDetect, manualP) {
    const arrayBuf = await item.file.arrayBuffer();
    const decoded = await getCtx().decodeAudioData(arrayBuf.slice(0));
    const work = getCtx().createBuffer(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
    for (let c = 0; c < decoded.numberOfChannels; c += 1) work.copyToChannel(decoded.getChannelData(c).slice(), c);
    // В авто-режиме определяем тип записи по самому звуку и берём его пресет.
    const detected = autoDetect ? detectKind(work) : null;
    const p = autoDetect ? PRESETS[detected] : manualP;
    if (p.gate > 0) applyGate(work, estimateFloor(work), p.gate);
    const rendered = await renderChain(work, p);
    normalizeAndLimit(rendered, p.targetRms, p.ceiling);
    const blob = encodeWAV(rendered);
    const base = item.name.replace(/\.[^.]+$/, '');
    return {
      outUrl: URL.createObjectURL(blob), outSize: blob.size, outName: `${base}-enhanced.wav`,
      detected, beforeUrl: URL.createObjectURL(item.file),
    };
  }

  async function processAll() {
    setBusy(true);
    const autoDetect = mode === 'auto';
    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await processOne(item, autoDetect, manual);
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...r, status: 'done' } : it)));
      } catch {
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
      }
    }
    setBusy(false);
  }

  // A/B прослушивание: один общий <audio>, переключаем до/после.
  function playAB(item, which) {
    const el = abRef.current; if (!el) return;
    const url = which === 'before' ? item.beforeUrl : item.outUrl;
    if (ab.id === item.id && ab.which === which && !el.paused) { el.pause(); setAb({ id: '', which: '' }); return; }
    el.src = url; el.play().catch(() => {}); setAb({ id: item.id, which });
  }

  function download(item) {
    const a = document.createElement('a');
    a.href = item.outUrl; a.download = item.outName;
    document.body.appendChild(a); a.click(); a.remove();
  }

  const doneCount = items.filter((it) => it.status === 'done').length;

  const Slider = ({ k, label, min, max, step, unit = '' }) => (
    <div className="tool-field">
      <span className="tool-field-label">{label}: {manual[k]}{unit}</span>
      <input type="range" min={min} max={max} step={step} value={manual[k]} onChange={(e) => setM(k, Number(e.target.value))} />
    </div>
  );

  return (
    <div className="tool-panel audio-enhancer">
      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.mode}</span>
          <div className="segmented">
            <button type="button" className={mode === 'auto' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode('auto')}>{t.auto}</button>
            <button type="button" className={mode === 'manual' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode('manual')}>{t.manual}</button>
          </div>
        </div>
        {mode === 'auto' && <p className="ae-auto-note">✨ {t.autoNote}</p>}
      </div>

      {mode === 'manual' && (
        <div className="ae-manual">
          <Slider k="warmth" label={t.warmth} min={-6} max={8} step={0.5} unit=" dB" />
          <Slider k="clarity" label={t.clarity} min={-3} max={9} step={0.5} unit=" dB" />
          <Slider k="air" label={t.air} min={-3} max={8} step={0.5} unit=" dB" />
          <Slider k="compThresh" label={t.compThresh} min={-50} max={0} step={1} unit=" dB" />
          <Slider k="compRatio" label={t.compRatio} min={1} max={12} step={0.5} unit=":1" />
          <Slider k="gate" label={t.gate} min={0} max={1} step={0.05} />
          <Slider k="deess" label={t.deess} min={0} max={1} step={0.05} />
        </div>
      )}

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
            <span className="convert-name" title={item.name}>
              {item.name}
              {item.status === 'done' && item.detected && (
                <span className="ae-detected">{t.detected}: {PRESETS[item.detected][language] || PRESETS[item.detected].ru}</span>
              )}
            </span>
            {item.status === 'done' && (
              <span className="ae-ab">
                <button type="button" className={ab.id === item.id && ab.which === 'before' ? 'ae-ab-btn is-on' : 'ae-ab-btn'} onClick={() => playAB(item, 'before')}>▶ {t.before}</button>
                <button type="button" className={ab.id === item.id && ab.which === 'after' ? 'ae-ab-btn is-on' : 'ae-ab-btn'} onClick={() => playAB(item, 'after')}>▶ {t.after}</button>
              </span>
            )}
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

      <audio ref={abRef} hidden onEnded={() => setAb({ id: '', which: '' })} />
      <input ref={inputRef} type="file" accept="audio/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🎚️ {t.chain}</p>
      <p className="tool-local-note">🔒 {t.local}</p>
    </div>
  );
}

export default AudioEnhancer;
