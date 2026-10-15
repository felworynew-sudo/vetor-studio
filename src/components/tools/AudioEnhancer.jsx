import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioCtx } from '../../utils/wav';

// Улучшение аудио 2.0 — локальный движок в Web Worker (src/audio-engine):
// диагностика → роутер → специализированные стадии. Речь: declip → подавление эха комнаты →
// DeepFilterNet3 → динамический EQ → лэвелер → компрессор → LUFS → true-peak.
// Музыка: без речевой нейросети; гул/клиппинг/шипение, резонансы, восстановление
// среза MP3 (SBR), динамический EQ, дрейф тембра, мастеринг по референсу.

const MODES = [
  { id: 'auto', ru: 'Авто', en: 'Auto', hint: { ru: 'Сам определит речь или музыку и соберёт цепочку под найденные дефекты.', en: 'Detects speech or music and builds a chain for the defects it finds.' } },
  { id: 'voice', ru: 'Голос', en: 'Voice', hint: { ru: 'Подкаст, видео, войс: DeepFilterNet3, динамический EQ, ровная громкость.', en: 'Podcast, video, voice-over: DeepFilterNet3, dynamic EQ, even loudness.' } },
  { id: 'restore', ru: 'Реставрация речи', en: 'Speech restore', hint: { ru: 'Тяжёлые записи: клиппинг, эхо комнаты, щелчки, сильный шум — всё агрессивнее.', en: 'Rough recordings: clipping, room echo, clicks, heavy noise — everything stronger.' } },
  { id: 'music', ru: 'Музыка', en: 'Music', hint: { ru: 'Бережно: без речевой нейросети, которая ест тарелки и пэды. Шипение, резкость, срез MP3, финал.', en: 'Gentle: no speech network that eats cymbals and pads. Hiss, harshness, MP3 cutoff, finish.' } },
  { id: 'ai', ru: 'AI-музыка', en: 'AI music', hint: { ru: 'Suno / Udio: металлический звон, «физ» на верху, сибилянты, плывущий тембр, срез экспорта.', en: 'Suno / Udio: metallic ringing, top-end fizz, sibilance, drifting tone, export cutoff.' } },
  { id: 'master', ru: 'Мастеринг по референсу', en: 'Reference master', hint: { ru: 'Загрузите 1–5 треков-ориентиров: подгоню тональный баланс, ширину стерео и громкость.', en: 'Add 1–5 reference tracks: tonal balance, stereo width and loudness are matched.' } },
];

const TARGETS = [
  { v: -14, ru: '−14 · стриминг', en: '−14 · streaming' },
  { v: -16, ru: '−16 · подкаст', en: '−16 · podcast' },
  { v: -19, ru: '−19 · тихо', en: '−19 · quiet' },
  { v: -23, ru: '−23 · ТВ', en: '−23 · TV' },
];

const FORMATS = [
  { v: 'wav24', ru: 'WAV 24 бит', en: 'WAV 24-bit' },
  { v: 'wav16', ru: 'WAV 16 бит', en: 'WAV 16-bit' },
  { v: 'mp3', ru: 'MP3 320', en: 'MP3 320' },
];

const STEP_LABEL = {
  dc: { ru: 'DC', en: 'DC' },
  hum: { ru: 'Гул', en: 'Hum' },
  declip: { ru: 'Клиппинг', en: 'Declip' },
  declick: { ru: 'Щелчки', en: 'Declick' },
  dereverb: { ru: 'Эхо комнаты', en: 'Room echo' },
  denoise: { ru: 'Нейро-шумодав', en: 'Neural denoise' },
  expander: { ru: 'Паузы', en: 'Expander' },
  'spectral-denoise': { ru: 'Шипение', en: 'Hiss' },
  resonance: { ru: 'Резонансы', en: 'Resonances' },
  bwe: { ru: 'Верх (SBR)', en: 'Highs (SBR)' },
  match: { ru: 'Референс', en: 'Reference' },
  dyneq: { ru: 'Динам. EQ', en: 'Dynamic EQ' },
  drift: { ru: 'Дрейф тембра', en: 'Tone drift' },
  tone: { ru: 'Тон', en: 'Tone' },
  stereo: { ru: 'Стерео', en: 'Stereo' },
  leveler: { ru: 'Лэвелер', en: 'Leveler' },
  compressor: { ru: 'Компрессор', en: 'Compressor' },
  loudness: { ru: 'LUFS', en: 'LUFS' },
  limiter: { ru: 'True peak', en: 'True peak' },
  encode: { ru: 'Экспорт', en: 'Export' },
};

const TEXT = {
  ru: {
    mode: 'Режим', target: 'Целевая громкость, LUFS', asRef: 'как у референса', ceiling: 'Потолок', format: 'Формат',
    intensity: 'Интенсивность', soft: 'мягко', strong: 'сильно',
    advanced: 'Тонкая настройка', auto: 'авто', on: 'вкл', off: 'выкл',
    opt: { denoise: 'Шумоподавление', dereverb: 'Удаление эха комнаты', declip: 'Восстановление клиппинга', declick: 'Удаление щелчков', bwe: 'Восстановление верха (SBR)', leveler: 'Лэвелер голоса', dehum: 'Подавление гула' },
    neural: 'Нейросеть для речи', dfn: 'DeepFilterNet3 · качество', rnn: 'RNNoise · лёгкая',
    monoBass: 'Моно-бас ниже 120 Гц', album: 'Единый профиль для всех файлов (альбом)',
    warmth: 'Тепло', presence: 'Разборчивость', air: 'Воздух',
    refs: 'Референсы', refsDrop: 'Перетащите 1–5 треков-ориентиров', refsHint: 'Готовые мастера в жанре, на которые хотите быть похожи',
    refsNeed: 'Для мастеринга по референсу загрузите хотя бы один трек-ориентир.',
    drop: 'Перетащите аудио сюда или нажмите', hint: 'WAV, MP3, FLAC, M4A, OGG — можно несколько файлов',
    analyzing: 'Анализ…', ready: 'Готов к обработке', process: 'Улучшить всё', processing: 'Обработка…',
    download: 'Скачать', downloadAll: 'Скачать всё', clear: 'Очистить', remove: 'Убрать',
    before: 'До', after: 'После', matchLevel: 'Сравнивать на равной громкости',
    diag: { speech: 'речь', music: 'музыка', lufs: 'Громкость', tp: 'Пик', lra: 'Динамика', clip: 'Клиппинг', cut: 'Срез', noise: 'Шумовой пол', reverb: 'Эхо комнаты', hum: 'Гул', stereo: 'Стерео', mono: 'моно' },
    spectrum: 'Спектр: до и после (форма, выровнено по середине)',
    neuralLoading: 'Загружаю DeepFilterNet3 (~16 МБ, один раз — дальше из кеша)…',
    neuralReady: 'DeepFilterNet3 готов', neuralFailed: 'DeepFilterNet3 недоступен в этом браузере — использую RNNoise',
    chain: 'Цепочка', error: 'Не удалось обработать этот файл',
    local: 'Всё считается в вашем браузере, файлы никуда не отправляются.',
    honest: 'Восстановление верха — SBR-реконструкция (как в HE-AAC), а не нейросеть: «воздух» правдоподобный, но это не возврат утерянного оригинала.',
  },
  en: {
    mode: 'Mode', target: 'Target loudness, LUFS', asRef: 'match reference', ceiling: 'Ceiling', format: 'Format',
    intensity: 'Intensity', soft: 'gentle', strong: 'strong',
    advanced: 'Fine tuning', auto: 'auto', on: 'on', off: 'off',
    opt: { denoise: 'Noise reduction', dereverb: 'Room echo removal', declip: 'Clipping repair', declick: 'Click removal', bwe: 'High-end restoration (SBR)', leveler: 'Voice leveler', dehum: 'Hum removal' },
    neural: 'Speech network', dfn: 'DeepFilterNet3 · quality', rnn: 'RNNoise · light',
    monoBass: 'Mono bass below 120 Hz', album: 'Shared profile for all files (album)',
    warmth: 'Warmth', presence: 'Presence', air: 'Air',
    refs: 'References', refsDrop: 'Drop 1–5 reference tracks', refsHint: 'Finished masters in the genre you want to sound like',
    refsNeed: 'Reference mastering needs at least one reference track.',
    drop: 'Drop audio here or click', hint: 'WAV, MP3, FLAC, M4A, OGG — several files are fine',
    analyzing: 'Analysing…', ready: 'Ready', process: 'Enhance all', processing: 'Processing…',
    download: 'Download', downloadAll: 'Download all', clear: 'Clear', remove: 'Remove',
    before: 'Before', after: 'After', matchLevel: 'Compare at equal loudness',
    diag: { speech: 'speech', music: 'music', lufs: 'Loudness', tp: 'Peak', lra: 'Range', clip: 'Clipping', cut: 'Cutoff', noise: 'Noise floor', reverb: 'Room echo', hum: 'Hum', stereo: 'Stereo', mono: 'mono' },
    spectrum: 'Spectrum: before and after (shape, aligned at mids)',
    neuralLoading: 'Loading DeepFilterNet3 (~16 MB, once — cached afterwards)…',
    neuralReady: 'DeepFilterNet3 ready', neuralFailed: 'DeepFilterNet3 is unavailable in this browser — using RNNoise',
    chain: 'Chain', error: 'Could not process this file',
    local: 'Everything runs in your browser, files are never uploaded.',
    honest: 'High-end restoration is SBR reconstruction (as in HE-AAC), not a neural net: the “air” is plausible, but it is not the lost original.',
  },
};

const OPT_KEYS = ['denoise', 'dereverb', 'declip', 'declick', 'bwe', 'leveler', 'dehum'];

let engine = null;
let msgSeq = 0;
const pending = new Map();
const listeners = new Set();
function getEngine() {
  if (engine) return engine;
  engine = new Worker(new URL('../../audio-engine/engine.worker.js', import.meta.url), { type: 'module' });
  engine.postMessage({ type: 'init', neuralBase: new URL(`${import.meta.env.BASE_URL}models/dfn3/`, window.location.href).href });
  engine.onmessage = (ev) => {
    const m = ev.data;
    listeners.forEach((fn) => fn(m));
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === 'progress') { p.onProgress?.(m); return; }
    pending.delete(m.id);
    if (m.type === 'error') p.reject(new Error(m.error)); else p.resolve(m);
  };
  return engine;
}
function call(msg, onProgress) {
  const id = `m${msgSeq += 1}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getEngine().postMessage({ ...msg, id });
  });
}

async function decode(file) {
  const buf = await getAudioCtx().decodeAudioData((await file.arrayBuffer()).slice(0));
  const chans = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c += 1) chans.push(buf.getChannelData(c).slice());
  return { chans, sr: buf.sampleRate };
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
function fmtBytes(b) { return b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`; }

function Diagnostics({ a, t }) {
  const chips = [];
  const push = (label, value, warn) => chips.push({ label, value, warn });
  push(a.content.kind === 'speech' ? t.diag.speech : t.diag.music, `${Math.round(a.content.confidence * 100)}%`);
  push(t.diag.lufs, `${fmt(a.lufs)} LUFS`);
  push(t.diag.tp, `${fmt(a.truePeakDb)} dBTP`, a.truePeakDb > -1);
  push(t.diag.lra, `${fmt(a.lra)} LU`);
  if (a.clipping.ratio > 0.00005) push(t.diag.clip, `${fmt(a.clipping.ratio * 100, 2)}%`, a.clipping.ratio > 0.0003);
  if (a.bandLimited) push(t.diag.cut, `${fmt(a.cutoffHz / 1000)} kHz`, true);
  // у непрерывной музыки без пауз шум не оценить — «пол» там просто тихие места
  const noiseKnown = a.content.kind === 'speech' || a.snrDb > 25;
  if (noiseKnown) push(t.diag.noise, `${fmt(a.noiseFloorDb, 0)} dBFS`, a.noiseFloorDb > -60);
  if (a.rt60 != null) push(t.diag.reverb, `~${fmt(a.rt60, 2)} s`, a.rt60 > 0.5);
  if (a.hum) push(t.diag.hum, `${a.hum.hz} Hz`, true);
  push(t.diag.stereo, a.channels > 1 ? `r = ${fmt(a.stereo.correlation, 2)}` : t.diag.mono);
  return (
    <div className="ae2-diag">
      {chips.map((c) => (
        <span key={c.label} className={c.warn ? 'ae2-chip is-warn' : 'ae2-chip'}><b>{c.label}</b> {c.value}</span>
      ))}
    </div>
  );
}

function Chain({ steps, language, current, done }) {
  return (
    <ol className="ae2-chain">
      {steps.map((s, i) => {
        const state = done ? 'is-done' : current == null ? '' : i < current ? 'is-done' : i === current ? 'is-active' : '';
        return <li key={`${s.id}-${i}`} className={`ae2-step ${state}`}>{(STEP_LABEL[s.id] || { ru: s.id })[language] || STEP_LABEL[s.id]?.ru}</li>;
      })}
    </ol>
  );
}

function Spectrum({ before, after, sr, t }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv || !before) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth; const h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const css = getComputedStyle(cv);
    const cLine = css.getPropertyValue('--stroke').trim() || '#444';
    const cSoft = css.getPropertyValue('--text-soft').trim() || '#888';
    const cAcc = css.getPropertyValue('--t-accent').trim() || '#f55';
    g.clearRect(0, 0, w, h);
    const N = before.N; const binHz = sr / N;
    const fx = (f) => (Math.log10(f / 20) / Math.log10((sr / 2) / 20)) * w;
    const norm = (db) => { const k0 = Math.round(300 / binHz); const k1 = Math.round(3000 / binHz); let m = 0; for (let k = k0; k <= k1; k += 1) m += db[k]; return m / (k1 - k0 + 1); };
    const top = 30; const range = 90;
    const yOf = (v) => ((top - v) / range) * h;
    g.strokeStyle = cLine; g.lineWidth = 1; g.fillStyle = cSoft; g.font = '10px monospace';
    for (const f of [50, 100, 500, 1000, 5000, 10000, 20000]) {
      if (f > sr / 2) continue;
      const x = Math.round(fx(f)) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 3, h - 4);
    }
    const draw = (db, color, width) => {
      const m = norm(db); g.strokeStyle = color; g.lineWidth = width; g.beginPath();
      let started = false;
      for (let k = Math.max(1, Math.round(20 / binHz)); k < db.length; k += 1) {
        const x = fx(k * binHz); const y = yOf(db[k] - m);
        if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
      }
      g.stroke();
    };
    draw(before.db, cSoft, 1.5);
    if (after) draw(after.db, cAcc, 2);
  }, [before, after, sr]);
  return (
    <figure className="ae2-spectrum">
      <canvas ref={ref} aria-label={t.spectrum} />
      <figcaption><span className="ae2-key is-before" /> {t.before} <span className="ae2-key is-after" /> {t.after} · {t.spectrum}</figcaption>
    </figure>
  );
}

function TriState({ value, onChange, t }) {
  return (
    <div className="segmented ae2-tri">
      {['auto', 'on', 'off'].map((v) => (
        <button key={v} type="button" className={value === v ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => onChange(v)}>{t[v]}</button>
      ))}
    </div>
  );
}

function AudioEnhancer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const refInputRef = useRef(null);
  const abRef = useRef(null);
  const [items, setItems] = useState([]);
  const [refs, setRefs] = useState([]);
  const [mode, setMode] = useState('auto');
  const [targetLufs, setTargetLufs] = useState(-14);
  const [ceilingDb, setCeilingDb] = useState(-1);
  const [format, setFormat] = useState('wav24');
  const [intensity, setIntensity] = useState(0.6);
  const [opts, setOpts] = useState(() => Object.fromEntries(OPT_KEYS.map((k) => [k, 'auto'])));
  const [neuralEngine, setNeuralEngine] = useState('dfn');
  const [tone, setTone] = useState({ warmth: 0, presence: 0, air: 0 });
  const [monoBass, setMonoBass] = useState(false);
  const [album, setAlbum] = useState(false);
  const [busy, setBusy] = useState(false);
  const [neural, setNeural] = useState('');
  const [ab, setAb] = useState({ id: '', which: '' });
  const [matchLevel, setMatchLevel] = useState(true);
  const [showAdv, setShowAdv] = useState(false);
  const dataRef = useRef(new Map()); // id → { chans, sr }

  useEffect(() => {
    const fn = (m) => { if (m.type === 'neural') setNeural(m.state); };
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const patch = (id, p) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...(typeof p === 'function' ? p(it) : p) } : it)));

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac|opus|aiff?)$/i.test(f.name));
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [...prev, { id, file, name: file.name, size: file.size, status: 'analyzing' }]);
      try {
        // eslint-disable-next-line no-await-in-loop
        const { chans, sr } = await decode(file);
        dataRef.current.set(id, { chans, sr });
        // eslint-disable-next-line no-await-in-loop
        const { analysis } = await call({ type: 'analyze', chans, sr });
        patch(id, { status: 'ready', analysis, sr, beforeUrl: URL.createObjectURL(file) });
      } catch {
        patch(id, { status: 'error' });
      }
    }
  }, []);

  const addRefs = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).slice(0, 5);
    for (const file of files) {
      const id = `r${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setRefs((prev) => [...prev, { id, name: file.name, status: 'analyzing' }].slice(0, 5));
      try {
        // eslint-disable-next-line no-await-in-loop
        const { chans, sr } = await decode(file);
        // eslint-disable-next-line no-await-in-loop
        const { profile } = await call({ type: 'profile', chans, sr });
        setRefs((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'ready', profile } : r)));
      } catch {
        setRefs((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'error' } : r)));
      }
    }
  }, []);

  async function processAll() {
    const readyRefs = refs.filter((r) => r.profile).map((r) => r.profile);
    if (mode === 'master' && !readyRefs.length) return;
    setBusy(true);
    let reference = null;
    if (readyRefs.length) reference = (await call({ type: 'combine', profiles: readyRefs })).profile;
    let albumProfile = null;
    if (album && mode !== 'voice' && mode !== 'restore') {
      const profs = [];
      for (const it of items) {
        const d = dataRef.current.get(it.id); if (!d) continue;
        // eslint-disable-next-line no-await-in-loop
        profs.push((await call({ type: 'profile', chans: d.chans, sr: d.sr })).profile);
      }
      if (profs.length > 1) albumProfile = (await call({ type: 'combine', profiles: profs })).profile;
    }
    const engineOpts = {
      targetLufs: targetLufs === 'ref' ? 'ref' : targetLufs, ceilingDb, intensity, ...opts, neural: neuralEngine,
      tone, monoBass, reference, albumProfile,
    };
    for (const it of items) {
      const d = dataRef.current.get(it.id);
      if (!d || it.status === 'analyzing') continue;
      patch(it.id, { status: 'processing', step: null, stepIndex: null, p: 0, after: null, error: '', warnings: [], planKey: previewKey });
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await call({ type: 'process', chans: d.chans, sr: d.sr, mode, opts: engineOpts, format, analysis: it.analysis }, (m) => {
          if (m.step && m.i != null) patch(it.id, { step: m.step, stepIndex: m.i });
          if (m.p != null) patch(it.id, { p: m.p });
        });
        const blob = new Blob([res.bytes], { type: res.mime });
        patch(it.id, (prev) => {
          if (prev.outUrl) URL.revokeObjectURL(prev.outUrl);
          return {
            status: 'done', outUrl: URL.createObjectURL(blob), outSize: blob.size,
            outName: `${it.name.replace(/\.[^.]+$/, '')}-enhanced.${res.ext}`, after: res.after, log: res.log, kind: res.kind, warnings: res.warnings || [],
          };
        });
      } catch (e) {
        patch(it.id, { status: 'error', error: e.message });
      }
    }
    setBusy(false);
  }

  function playAB(item, which) {
    const el = abRef.current; if (!el) return;
    if (ab.id === item.id && ab.which === which && !el.paused) { el.pause(); setAb({ id: '', which: '' }); return; }
    const pos = ab.id === item.id ? el.currentTime : 0;
    el.src = which === 'before' ? item.beforeUrl : item.outUrl;
    let vol = 1;
    if (matchLevel && item.after && Number.isFinite(item.analysis.lufs) && Number.isFinite(item.after.lufs)) {
      const diff = item.after.lufs - item.analysis.lufs; // > 0 — результат громче
      if (which === 'after' && diff > 0) vol = 10 ** (-diff / 20);
      if (which === 'before' && diff < 0) vol = 10 ** (diff / 20);
    }
    el.volume = Math.max(0, Math.min(1, vol));
    el.onloadedmetadata = () => { try { el.currentTime = Math.min(pos, el.duration || pos); } catch { /* ignore */ } };
    el.play().catch(() => {});
    setAb({ id: item.id, which });
  }

  function download(item) {
    const a = document.createElement('a');
    a.href = item.outUrl; a.download = item.outName;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function removeItem(id) {
    dataRef.current.delete(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // Предпросмотр цепочки — тот же роутер, что в воркере, но без тяжёлых данных.
  const [previews, setPreviews] = useState({});
  const previewKey = JSON.stringify([mode, targetLufs, ceilingDb, intensity, opts, neuralEngine, tone, monoBass, refs.length]);
  useEffect(() => {
    let cancelled = false;
    import('../../audio-engine/pipeline.js').then(({ plan }) => {
      if (cancelled) return;
      const next = {};
      for (const it of items) {
        if (!it.analysis) continue;
        const fakeRef = refs.some((r) => r.profile) ? { sideToMid: 0, db: [] } : null;
        next[it.id] = plan(it.analysis, mode, { targetLufs, ceilingDb, intensity, ...opts, neural: neuralEngine, tone, monoBass, reference: fakeRef });
      }
      setPreviews(next);
    });
    return () => { cancelled = true; };
  }, [items, previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const modeInfo = MODES.find((m) => m.id === mode);
  const readyCount = items.filter((it) => it.status === 'ready' || it.status === 'done').length;
  const doneCount = items.filter((it) => it.status === 'done').length;
  const needRefs = mode === 'master' && !refs.some((r) => r.profile);
  const speechMode = mode === 'voice' || mode === 'restore';

  return (
    <div className="tool-panel audio-enhancer ae2">
      <div className="tool-field ae2-modes">
        <span className="tool-field-label">{t.mode}</span>
        <div className="segmented ae2-mode-seg">
          {MODES.map((m) => (
            <button key={m.id} type="button" className={mode === m.id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode(m.id)}>{m[language] || m.ru}</button>
          ))}
        </div>
        <p className="ae2-mode-hint">{modeInfo.hint[language] || modeInfo.hint.ru}</p>
      </div>

      <div className="tool-controls ae2-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.target}</span>
          <div className="segmented">
            {TARGETS.map((x) => <button key={x.v} type="button" className={targetLufs === x.v ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTargetLufs(x.v)}>{x[language] || x.ru}</button>)}
            {mode === 'master' && <button type="button" className={targetLufs === 'ref' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTargetLufs('ref')}>{t.asRef}</button>}
          </div>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.ceiling}</span>
          <div className="segmented">
            {[-1, -2].map((v) => <button key={v} type="button" className={ceilingDb === v ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setCeilingDb(v)}>{`${v === -1 ? '−1' : '−2'} dBTP`}</button>)}
          </div>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.format}</span>
          <div className="segmented">
            {FORMATS.map((f) => <button key={f.v} type="button" className={format === f.v ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFormat(f.v)}>{f[language] || f.ru}</button>)}
          </div>
        </div>
        <div className="tool-field ae2-intensity">
          <span className="tool-field-label">{t.intensity}: {Math.round(intensity * 100)}%</span>
          <input type="range" min="0" max="1" step="0.05" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} aria-label={t.intensity} />
          <span className="ae2-range-ends"><span>{t.soft}</span><span>{t.strong}</span></span>
        </div>
      </div>

      <button type="button" className="ae2-adv-toggle" aria-expanded={showAdv} onClick={() => setShowAdv((v) => !v)}>{showAdv ? '▾' : '▸'} {t.advanced}</button>
      {showAdv && (
        <div className="ae2-adv">
          <div className="ae2-opts">
            {OPT_KEYS.map((k) => (
              <div key={k} className="ae2-opt">
                <span>{t.opt[k]}</span>
                <TriState value={opts[k]} onChange={(v) => setOpts((o) => ({ ...o, [k]: v }))} t={t} />
              </div>
            ))}
          </div>
          <div className="ae2-adv-row">
            <div className="tool-field">
              <span className="tool-field-label">{t.neural}</span>
              <div className="segmented">
                <button type="button" className={neuralEngine === 'dfn' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setNeuralEngine('dfn')}>{t.dfn}</button>
                <button type="button" className={neuralEngine === 'rnnoise' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setNeuralEngine('rnnoise')}>{t.rnn}</button>
              </div>
            </div>
            {['warmth', 'presence', 'air'].map((k) => (
              <div key={k} className="tool-field">
                <span className="tool-field-label">{t[k]}: {tone[k] > 0 ? '+' : ''}{tone[k]} dB</span>
                <input type="range" min="-6" max="6" step="0.5" value={tone[k]} onChange={(e) => setTone((o) => ({ ...o, [k]: Number(e.target.value) }))} />
              </div>
            ))}
          </div>
          {!speechMode && (
            <div className="ae2-adv-row">
              <label className="tool-check"><input type="checkbox" checked={monoBass} onChange={(e) => setMonoBass(e.target.checked)} /> {t.monoBass}</label>
              <label className="tool-check"><input type="checkbox" checked={album} onChange={(e) => setAlbum(e.target.checked)} /> {t.album}</label>
            </div>
          )}
        </div>
      )}

      {mode === 'master' && (
        <div className="ae2-refs">
          <span className="tool-field-label">{t.refs}</span>
          <button
            type="button" className="tool-dropzone ae2-ref-drop"
            onClick={() => refInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addRefs(e.dataTransfer.files); }}
          >
            <span className="tool-dropzone-title">{t.refsDrop}</span>
            <span className="tool-dropzone-hint">{t.refsHint}</span>
          </button>
          {refs.length > 0 && (
            <ul className="ae2-ref-list">
              {refs.map((r) => (
                <li key={r.id}>
                  <span className="convert-name">{r.name}</span>
                  <span className="convert-sizes">{r.status === 'ready' ? `${fmt(r.profile.lufs)} LUFS` : r.status === 'error' ? '⚠' : t.analyzing}</span>
                  <button type="button" className="ae-ab-btn" onClick={() => setRefs((p) => p.filter((x) => x.id !== r.id))}>{t.remove}</button>
                </li>
              ))}
            </ul>
          )}
          <input ref={refInputRef} type="file" accept="audio/*" multiple hidden onChange={(e) => { addRefs(e.target.files); e.target.value = ''; }} />
        </div>
      )}

      <button
        type="button" className="tool-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      {items.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={processAll} disabled={busy || !readyCount || needRefs}>{busy ? t.processing : t.process}</button>
          {doneCount > 0 && <button type="button" className="tool-btn" onClick={() => items.filter((it) => it.outUrl).forEach((it, i) => setTimeout(() => download(it), i * 300))}>{t.downloadAll} ({doneCount})</button>}
          <button type="button" className="tool-btn ghost" onClick={() => { dataRef.current.clear(); setItems([]); }} disabled={busy}>{t.clear}</button>
          {doneCount > 0 && <label className="tool-check"><input type="checkbox" checked={matchLevel} onChange={(e) => setMatchLevel(e.target.checked)} /> {t.matchLevel}</label>}
        </div>
      )}
      {needRefs && items.length > 0 && <p className="ae2-warn">{t.refsNeed}</p>}
      {neural === 'loading' && busy && <p className="ae2-neural">⏳ {t.neuralLoading}</p>}
      {neural === 'failed' && <p className="ae2-neural is-warn">⚠ {t.neuralFailed}</p>}

      <ul className="ae2-list">
        {items.map((it) => {
          const pv = previews[it.id];
          // после смены настроек показываем новый план, а не цепочку прошлого прогона
          const fresh = it.log && it.planKey === previewKey;
          const steps = (fresh ? it.log : pv?.steps) || it.log || [];
          return (
            <li key={it.id} className={`ae2-item status-${it.status}`}>
              <div className="ae2-item-head">
                <span className="ae2-item-name" title={it.name}>{it.name}</span>
                <span className="convert-sizes">
                  {fmtBytes(it.size)}{it.outSize ? <> → <strong>{fmtBytes(it.outSize)}</strong></> : null}
                </span>
                {it.status === 'done' && (
                  <span className="ae-ab">
                    <button type="button" className={ab.id === it.id && ab.which === 'before' ? 'ae-ab-btn is-on' : 'ae-ab-btn'} onClick={() => playAB(it, 'before')}>▶ {t.before}</button>
                    <button type="button" className={ab.id === it.id && ab.which === 'after' ? 'ae-ab-btn is-on' : 'ae-ab-btn'} onClick={() => playAB(it, 'after')}>▶ {t.after}</button>
                  </span>
                )}
                {it.status === 'done' && <button type="button" className="tool-btn small" onClick={() => download(it)}>{t.download}</button>}
                {!busy && it.status !== 'processing' && <button type="button" className="ae-ab-btn ae2-remove" onClick={() => removeItem(it.id)} aria-label={t.remove}>✕</button>}
              </div>
              {it.status === 'analyzing' && <p className="ae2-status">{t.analyzing}</p>}
              {it.warnings?.length > 0 && <p className="ae2-warn">⚠ {it.warnings.join(' · ')}</p>}
              {it.status === 'error' && <p className="ae2-warn">⚠ {t.error}{it.error ? `: ${it.error}` : ''}</p>}
              {it.analysis && <Diagnostics a={it.analysis} t={t} />}
              {steps.length > 0 && (
                <div className="ae2-chain-wrap">
                  <span className="ae2-chain-label">{t.chain}</span>
                  <Chain steps={steps} language={language} current={it.status === 'processing' ? it.stepIndex : null} done={it.status === 'done' && fresh} />
                </div>
              )}
              {it.status === 'processing' && (
                <div className="bgr-progress ae2-progress">
                  <span>{t.processing} {it.step && STEP_LABEL[it.step] ? `· ${STEP_LABEL[it.step][language] || STEP_LABEL[it.step].ru}` : ''}</span>
                  <div className="bgr-bar"><div className="bgr-bar-fill" style={{ width: `${Math.round((it.p || 0) * 100)}%` }} /></div>
                </div>
              )}
              {it.status === 'done' && it.after && (
                <p className="ae2-result">
                  {fmt(it.analysis.lufs)} → <b>{fmt(it.after.lufs)} LUFS</b> · {fmt(it.analysis.truePeakDb)} → <b>{fmt(it.after.truePeakDb)} dBTP</b> · LRA {fmt(it.analysis.lra)} → <b>{fmt(it.after.lra)} LU</b>
                  {it.log?.find((l) => l.id === 'denoise') ? ` · ${it.log.find((l) => l.id === 'denoise').engine === 'dfn' ? 'DeepFilterNet3' : it.log.find((l) => l.id === 'denoise').engine === 'rnnoise' ? 'RNNoise' : 'spectral'}` : ''}
                </p>
              )}
              {it.analysis && (it.status === 'done' || it.status === 'ready') && (
                <Spectrum before={it.analysis.spectrum} after={it.after?.spectrum} sr={it.sr} t={t} />
              )}
            </li>
          );
        })}
      </ul>

      <audio ref={abRef} hidden onEnded={() => setAb({ id: '', which: '' })} />
      <input ref={inputRef} type="file" accept="audio/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.local}</p>
      <p className="tool-local-note">ℹ️ {t.honest}</p>
    </div>
  );
}

export default AudioEnhancer;
