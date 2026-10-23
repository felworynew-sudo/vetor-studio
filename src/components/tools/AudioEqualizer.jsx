import { useEffect, useMemo, useRef, useState } from 'react';
import { getAudioCtx, downloadBlob } from '../../utils/wav';
import {
  decodeNative, describeSource, encodeLike, formatChoices, outputName, probeAudio, recompressNote,
} from '../../utils/audioFormat';
import {
  BAND_TYPES, GAIN_MAX, PRESETS, PRESET_GROUPS, autoPreampDb, bandLabel, defaultModel, isFlat, logFreqs, presetModel, responseDb, sanitizeModel, totalPreDb,
} from '../../utils/eqModel';
import { createEqChain, renderEq } from '../../utils/eqAudio';
import { truePeakDb } from '../../audio-engine/dsp';
import { truePeakLimit } from '../../audio-engine/dynamics';

// Эквалайзер: файл играет через живую цепочку BiquadFilterNode — тянете узел на графике,
// двигаете слайдер или выбираете пресет, и звук меняется сразу, без пересчёта файла.
// Экспорт — тот же набор фильтров офлайн, частями, и кодирование обратно в исходный формат.

const TEXT = {
  ru: {
    drop: 'Загрузите аудио для эквализации', hint: 'MP3, WAV, FLAC, M4A, OGG, Opus — всё локально; экспорт в том же формате', change: 'Другой файл', openErr: 'Браузер не смог открыть этот файл — попробуйте WAV или MP3.',
    play: 'Играть', pause: 'Пауза', on: 'EQ включён', off: 'Оригинал (EQ выключен)', reset: 'Сбросить', undo: 'Отменить',
    preset: 'Пресет', pick: 'Выбрать пресет…', mine: 'Мои пресеты', savePh: 'Название пресета', save: 'Сохранить', del: 'Удалить', exportPreset: 'Скачать пресет', importPreset: 'Загрузить пресет (.json)',
    advanced: 'Параметрический режим (частота, добротность, тип)', advHint: 'Тяните узел по горизонтали — частота, колесо мыши над узлом — добротность Q, двойной клик — обнулить.',
    graphHint: 'Тяните узлы вверх-вниз — усиление.', band: 'Полоса', type: 'Тип', freq: 'Частота, Гц', q: 'Q', bandOn: 'Вкл',
    types: { peaking: 'Колокол', lowshelf: 'Полка низа', highshelf: 'Полка верха', notch: 'Режекторный' },
    hp: 'Срез низов (HP)', lp: 'Срез верха (LP)', pre: 'Громкость на выходе', auto: 'Авто-компенсация подъёма', preTotal: (v) => `Итого: ${v > 0 ? '+' : ''}${v.toFixed(1)} дБ`,
    peak: 'Пик', clip: 'Подъём выше 0 дБ: на громком материале возможен клиппинг. Включите авто-компенсацию или опустите громкость.',
    exportT: 'Экспорт', format: 'Формат', protect: 'Защита от клиппинга (лимитер −1 дБ)', go: 'Применить и скачать', cancel: 'Отмена',
    st: { decode: 'Читаю файл…', render: 'Применяю эквалайзер…', encode: 'Кодирую…' }, flatNote: 'Эквалайзер ровный — звук не изменится.',
    keys: 'Клавиши: Пробел — играть/пауза · B — сравнить с оригиналом · Ctrl+Z — отменить.', src: 'Исходник',
  },
  en: {
    drop: 'Upload audio to equalize', hint: 'MP3, WAV, FLAC, M4A, OGG, Opus — all local; exports in the same format', change: 'Another file', openErr: 'The browser could not open this file — try WAV or MP3.',
    play: 'Play', pause: 'Pause', on: 'EQ on', off: 'Original (EQ off)', reset: 'Reset', undo: 'Undo',
    preset: 'Preset', pick: 'Choose a preset…', mine: 'My presets', savePh: 'Preset name', save: 'Save', del: 'Delete', exportPreset: 'Download preset', importPreset: 'Load preset (.json)',
    advanced: 'Parametric mode (frequency, Q, type)', advHint: 'Drag a node sideways for frequency, mouse wheel over a node for Q, double-click to reset.',
    graphHint: 'Drag nodes up and down for gain.', band: 'Band', type: 'Type', freq: 'Frequency, Hz', q: 'Q', bandOn: 'On',
    types: { peaking: 'Bell', lowshelf: 'Low shelf', highshelf: 'High shelf', notch: 'Notch' },
    hp: 'Low cut (HP)', lp: 'High cut (LP)', pre: 'Output level', auto: 'Auto-compensate boosts', preTotal: (v) => `Total: ${v > 0 ? '+' : ''}${v.toFixed(1)} dB`,
    peak: 'Peak', clip: 'Boost above 0 dB: loud material may clip. Turn on auto-compensation or lower the level.',
    exportT: 'Export', format: 'Format', protect: 'Clipping protection (−1 dB limiter)', go: 'Apply and download', cancel: 'Cancel',
    st: { decode: 'Reading the file…', render: 'Applying the equalizer…', encode: 'Encoding…' }, flatNote: 'The equalizer is flat — the sound will not change.',
    keys: 'Keys: Space — play/pause · B — compare with the original · Ctrl+Z — undo.', src: 'Source',
  },
};

const STORE_KEY = 'vetor.eq.v1';
const PRESETS_KEY = 'vetor.eq.presets.v1';
const PAD = { l: 38, r: 10, t: 10, b: 20 };
const GRAPH_H = 300;
const FREQ_MARKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const readJson = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };
const xOf = (f, w) => PAD.l + (Math.log(f / 20) / Math.log(1000)) * (w - PAD.l - PAD.r);
const fOf = (x, w) => 20 * 1000 ** ((x - PAD.l) / (w - PAD.l - PAD.r));
const yOf = (db) => PAD.t + ((GAIN_MAX - db) / (2 * GAIN_MAX)) * (GRAPH_H - PAD.t - PAD.b);
const dbOf = (y) => GAIN_MAX - ((y - PAD.t) / (GRAPH_H - PAD.t - PAD.b)) * 2 * GAIN_MAX;
const round1 = (v) => Math.round(v * 10) / 10;

function AudioEqualizer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const en = language === 'en';
  const inputRef = useRef(null);
  const presetFileRef = useRef(null);
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const chainRef = useRef(null);
  const srcRef = useRef(null);
  const bufRef = useRef(null);
  const fileRef = useRef(null);
  const urlRef = useRef('');
  const dragRef = useRef(null);
  const hoverRef = useRef(-1);
  const historyRef = useRef({ stack: [], last: 0 });
  const cancelRef = useRef(false);
  const rafRef = useRef(0);
  const peakRef = useRef(-120);
  const [name, setName] = useState('');
  const [probe, setProbe] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [model, setModelState] = useState(() => sanitizeModel(readJson(STORE_KEY, null)));
  const [bypass, setBypass] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selected, setSelected] = useState(5);
  const [advanced, setAdvanced] = useState(false);
  const [presetId, setPresetId] = useState('');
  const [mine, setMine] = useState(() => readJson(PRESETS_KEY, []));
  const [presetName, setPresetName] = useState('');
  const [target, setTarget] = useState('source');
  const [protect, setProtect] = useState(true);
  const [busy, setBusy] = useState(null); // { stage, p }
  const [error, setError] = useState('');
  const [width, setWidth] = useState(720);
  const [canUndo, setCanUndo] = useState(false);

  const sr = ctxRef.current?.sampleRate || 48000;
  const freqs = useMemo(() => logFreqs(Math.max(120, Math.round(width / 2))), [width]);
  const curve = useMemo(() => responseDb(model, freqs, sr), [model, freqs, sr]);
  const R = useRef({}); R.current = { model, bypass, selected, advanced, width, playing, curve, freqs };
  const preTotal = totalPreDb(model, sr);
  const autoPre = autoPreampDb(model, sr);

  // ---------- модель: правки, история, сохранение ----------
  function setModel(next, { record = true } = {}) {
    const h = historyRef.current; const now = Date.now();
    if (record && now - h.last > 700) { h.stack.push(R.current.model); if (h.stack.length > 60) h.stack.shift(); setCanUndo(true); }
    if (record) h.last = now;
    setModelState(next);
  }
  function undo() {
    const h = historyRef.current; const prev = h.stack.pop();
    if (prev) { setModelState(prev); setPresetId(''); h.last = 0; setCanUndo(h.stack.length > 0); }
  }
  const patchBand = (i, patch) => { setPresetId(''); setModel({ ...R.current.model, bands: R.current.model.bands.map((b, k) => (k === i ? { ...b, ...patch } : b)) }); };
  const patchModel = (patch) => { setPresetId(''); setModel({ ...R.current.model, ...patch }); };

  useEffect(() => {
    chainRef.current?.apply(model);
    const id = setTimeout(() => writeJson(STORE_KEY, model), 400);
    return () => clearTimeout(id);
  }, [model]);
  useEffect(() => { chainRef.current?.setBypass(bypass); }, [bypass]);

  // ---------- файл и проигрывание ----------
  function ensureChain() {
    if (chainRef.current) return;
    const ctx = getAudioCtx(); ctxRef.current = ctx;
    const chain = createEqChain(ctx); chain.output.connect(ctx.destination);
    chain.apply(R.current.model); chain.setBypass(R.current.bypass);
    chainRef.current = chain;
  }
  function teardownFile() {
    cancelAnimationFrame(rafRef.current);
    const a = audioRef.current; if (a) { a.pause(); a.removeAttribute('src'); a.load(); }
    try { srcRef.current?.disconnect(); } catch { /* */ }
    srcRef.current = null; audioRef.current = null; bufRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = '';
    setPlaying(false); setPos(0);
  }
  async function loadFile(file) {
    if (!file) return;
    teardownFile(); setLoadErr(''); setError(''); setLoaded(false);
    try {
      ensureChain();
      const url = URL.createObjectURL(file); urlRef.current = url;
      const a = new Audio(); a.preload = 'auto'; a.src = url;
      await new Promise((res, rej) => { a.onloadedmetadata = res; a.onerror = () => rej(new Error('open')); });
      const node = ctxRef.current.createMediaElementSource(a); node.connect(chainRef.current.input);
      a.onended = () => { setPlaying(false); };
      audioRef.current = a; srcRef.current = node; fileRef.current = file;
      setDuration(a.duration || 0); setName(file.name); setLoaded(true);
      probeAudio(file).then(setProbe);
    } catch (e) {
      console.error(e); setLoadErr(t.openErr); teardownFile();
    }
  }
  function togglePlay() {
    const a = audioRef.current; if (!a) return;
    const ctx = ctxRef.current; if (ctx.state === 'suspended') ctx.resume();
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => {}); } else { a.pause(); setPlaying(false); }
  }
  function seek(v) { const a = audioRef.current; if (a) { a.currentTime = v; setPos(v); } }
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => { if (audioRef.current) setPos(audioRef.current.currentTime); }, 250);
    return () => clearInterval(id);
  }, [playing]);
  useEffect(() => () => { teardownFile(); chainRef.current?.dispose(); chainRef.current = null; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target; const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (!audioRef.current) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space' && tag !== 'BUTTON') { e.preventDefault(); togglePlay(); } else if (e.code === 'KeyB') { e.preventDefault(); setBypass((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- график ----------
  useEffect(() => {
    const el = wrapRef.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.max(320, Math.floor(el.clientWidth))));
    ro.observe(el); setWidth(Math.max(320, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, [loaded]);

  const spec = useRef({ pre: null, post: null, td: null, cols: null, key: '' });
  function draw() {
    const c = canvasRef.current; if (!c) return;
    const { model: m, selected: sel, width: w } = R.current;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(GRAPH_H * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(GRAPH_H * dpr); c.style.height = `${GRAPH_H}px`; }
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, GRAPH_H);
    const cs = getComputedStyle(c); const accent = cs.getPropertyValue('--t-accent').trim() || '#6166ff'; const muted = cs.getPropertyValue('--text-muted').trim() || '#9aa0b8'; const stroke = cs.getPropertyValue('--stroke').trim() || '#2a2d40';
    const innerW = w - PAD.l - PAD.r; const innerH = GRAPH_H - PAD.t - PAD.b;
    // сетка
    x.lineWidth = 1; x.font = '11px system-ui, sans-serif'; x.fillStyle = muted; x.strokeStyle = stroke;
    for (let db = -GAIN_MAX; db <= GAIN_MAX; db += 6) { const y = Math.round(yOf(db)) + 0.5; x.globalAlpha = db === 0 ? 0.9 : 0.45; x.beginPath(); x.moveTo(PAD.l, y); x.lineTo(w - PAD.r, y); x.stroke(); x.globalAlpha = 1; x.fillText(`${db > 0 ? '+' : ''}${db}`, 6, y + 4); }
    FREQ_MARKS.forEach((f) => { const px = Math.round(xOf(f, w)) + 0.5; x.globalAlpha = 0.45; x.beginPath(); x.moveTo(px, PAD.t); x.lineTo(px, PAD.t + innerH); x.stroke(); x.globalAlpha = 1; x.fillText(bandLabel(f), Math.min(w - 24, px - 8), GRAPH_H - 5); });
    // срезы HP/LP — затенение
    x.fillStyle = 'rgba(0,0,0,0.35)';
    if (m.hp.on) x.fillRect(PAD.l, PAD.t, xOf(m.hp.f, w) - PAD.l, innerH);
    if (m.lp.on) x.fillRect(xOf(m.lp.f, w), PAD.t, w - PAD.r - xOf(m.lp.f, w), innerH);
    // спектр (после EQ — заливка, до — линия)
    const ch = chainRef.current;
    if (ch) {
      const key = `${w}|${ctxRef.current.sampleRate}`;
      const S = spec.current;
      if (S.key !== key) {
        const bins = ch.analyserPost.frequencyBinCount; const hz = ctxRef.current.sampleRate / 2 / bins;
        S.cols = Array.from({ length: Math.round(innerW) }, (_, i) => { const f0 = fOf(PAD.l + i, w); const f1 = fOf(PAD.l + i + 1, w); return [Math.max(1, Math.floor(f0 / hz)), Math.max(1, Math.min(bins - 1, Math.ceil(f1 / hz)))]; });
        S.pre = new Float32Array(bins); S.post = new Float32Array(bins); S.td = new Float32Array(ch.analyserPost.fftSize); S.key = key;
      }
      ch.analyserPre.getFloatFrequencyData(S.pre); ch.analyserPost.getFloatFrequencyData(S.post);
      const line = (arr, fill) => {
        x.beginPath();
        S.cols.forEach(([lo, hi], i) => { let v = -200; for (let k = lo; k <= hi; k += 1) if (arr[k] > v) v = arr[k]; const y = PAD.t + innerH - Math.max(0, Math.min(1, (v + 96) / 90)) * innerH; if (i === 0) x.moveTo(PAD.l, y); else x.lineTo(PAD.l + i, y); });
        if (fill) { x.lineTo(PAD.l + S.cols.length, PAD.t + innerH); x.lineTo(PAD.l, PAD.t + innerH); x.closePath(); x.globalAlpha = 0.22; x.fillStyle = accent; x.fill(); x.globalAlpha = 1; } else { x.strokeStyle = muted; x.globalAlpha = 0.55; x.lineWidth = 1; x.stroke(); x.globalAlpha = 1; }
      };
      line(S.pre, false); line(S.post, true);
      ch.analyserPost.getFloatTimeDomainData(S.td);
      let pk = 0; for (let i = 0; i < S.td.length; i += 1) { const v = Math.abs(S.td[i]); if (v > pk) pk = v; }
      peakRef.current = Math.max(pk > 0 ? 20 * Math.log10(pk) : -120, peakRef.current - 0.7);
    }
    // кривая EQ
    x.beginPath(); x.lineWidth = 2.5; x.strokeStyle = R.current.bypass ? muted : '#ffffff'; x.globalAlpha = R.current.bypass ? 0.5 : 1;
    const { curve: cv, freqs: fr } = R.current;
    cv.forEach((db, i) => { const px = xOf(fr[i], w); const py = yOf(Math.max(-GAIN_MAX, Math.min(GAIN_MAX, db))); if (i === 0) x.moveTo(px, py); else x.lineTo(px, py); });
    x.stroke(); x.globalAlpha = 1;
    // узлы
    m.bands.forEach((b, i) => {
      const px = xOf(b.f, w); const py = yOf(b.type === 'notch' ? 0 : b.gain);
      x.beginPath(); x.arc(px, py, i === sel ? 8 : 6, 0, Math.PI * 2);
      x.fillStyle = b.on ? (i === sel ? '#fff' : accent) : 'rgba(120,120,140,0.6)'; x.fill();
      x.lineWidth = 2; x.strokeStyle = 'rgba(0,0,0,0.5)'; x.stroke();
    });
    const hi = hoverRef.current >= 0 ? hoverRef.current : (dragRef.current ? dragRef.current.i : -1);
    if (hi >= 0) {
      const b = m.bands[hi]; const px = xOf(b.f, w); const py = yOf(b.type === 'notch' ? 0 : b.gain);
      const label = `${bandLabel(b.f)} Гц · ${b.gain > 0 ? '+' : ''}${b.gain.toFixed(1)} дБ · Q ${b.q.toFixed(2)}`.replace('Гц', en ? 'Hz' : 'Гц').replace('дБ', en ? 'dB' : 'дБ');
      x.font = '12px system-ui, sans-serif'; const tw = x.measureText(label).width + 12; const bx = Math.max(PAD.l, Math.min(w - tw - 4, px - tw / 2)); const by = py < 40 ? py + 14 : py - 34;
      x.fillStyle = 'rgba(15,16,28,0.92)'; x.fillRect(bx, by, tw, 22); x.fillStyle = '#fff'; x.fillText(label, bx + 6, by + 15);
    }
    // индикатор пика
    const pkDb = peakRef.current; x.font = '12px system-ui, sans-serif'; x.fillStyle = pkDb > -0.1 ? '#ff6b6b' : muted;
    x.fillText(`${t.peak}: ${pkDb > -119 ? pkDb.toFixed(1) : '—'} dB`, w - PAD.r - 92, PAD.t + 12);
  }
  useEffect(() => {
    if (!loaded) return undefined;
    cancelAnimationFrame(rafRef.current);
    if (playing) {
      const loop = () => { if (!document.hidden) draw(); rafRef.current = requestAnimationFrame(loop); };
      rafRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafRef.current);
    }
    draw();
    return undefined;
  }); // перерисовка при любой правке; в паузе — разово, при игре — по кадрам

  const nearNode = (e) => {
    const r = canvasRef.current.getBoundingClientRect(); const px = e.clientX - r.left; const py = e.clientY - r.top;
    let best = -1; let bd = 16;
    R.current.model.bands.forEach((b, i) => { const d = Math.hypot(xOf(b.f, R.current.width) - px, yOf(b.type === 'notch' ? 0 : b.gain) - py); if (d < bd) { best = i; bd = d; } });
    return best;
  };
  function onDown(e) {
    const i = nearNode(e); if (i < 0) return;
    canvasRef.current.setPointerCapture?.(e.pointerId); setSelected(i); dragRef.current = { i };
  }
  function onMove(e) {
    const d = dragRef.current; const r = canvasRef.current.getBoundingClientRect();
    if (!d) { const h = nearNode(e); if (h !== hoverRef.current) { hoverRef.current = h; canvasRef.current.style.cursor = h >= 0 ? 'grab' : 'default'; if (!R.current.playing) draw(); } return; }
    const b = R.current.model.bands[d.i];
    let gain = Math.max(-GAIN_MAX, Math.min(GAIN_MAX, round1(dbOf(e.clientY - r.top)))); if (Math.abs(gain) < 0.25) gain = 0;
    const patch = { gain: b.type === 'notch' ? 0 : gain };
    if (R.current.advanced) patch.f = Math.round(Math.max(20, Math.min(20000, fOf(e.clientX - r.left, R.current.width))));
    patchBand(d.i, patch);
  }
  function onUp() { dragRef.current = null; }
  useEffect(() => {
    const c = canvasRef.current; if (!c) return undefined;
    const onWheel = (e) => {
      if (!R.current.advanced) return;
      const i = nearNode(e); if (i < 0) return;
      e.preventDefault();
      const b = R.current.model.bands[i]; patchBand(i, { q: Math.max(0.1, Math.min(18, +(b.q * Math.exp(-e.deltaY * 0.002)).toFixed(2))) });
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- пресеты ----------
  function applyPreset(id) {
    if (!id) return;
    const user = id.startsWith('u:') ? mine[Number(id.slice(2))] : null;
    const next = user ? sanitizeModel(user.model) : presetModel(id, R.current.model);
    if (!next) return;
    setModel({ ...next, autoPre: R.current.model.autoPre, pre: user ? next.pre : 0 });
    setPresetId(id);
  }
  function savePreset() {
    const nm = presetName.trim(); if (!nm) return;
    const list = [...mine.filter((p) => p.name !== nm), { name: nm, model }];
    setMine(list); writeJson(PRESETS_KEY, list); setPresetId(`u:${list.length - 1}`); setPresetName('');
  }
  function deletePreset() {
    if (!presetId.startsWith('u:')) return;
    const list = mine.filter((_, i) => i !== Number(presetId.slice(2))); setMine(list); writeJson(PRESETS_KEY, list); setPresetId('');
  }
  function exportPresetFile() {
    const nm = (presetId.startsWith('u:') ? mine[Number(presetId.slice(2))]?.name : PRESETS.find((p) => p.id === presetId)?.[language]) || 'eq-preset';
    downloadBlob(new Blob([JSON.stringify({ app: 'vetor-eq', name: nm, model }, null, 2)], { type: 'application/json' }), `${nm.replace(/[^\p{L}\p{N}_-]+/gu, '-')}.eq.json`);
  }
  async function importPresetFile(file) {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const next = sanitizeModel(raw.model || raw); setModel(next); setPresetId('');
      const nm = String(raw.name || file.name.replace(/\.[^.]+$/, '')).slice(0, 40);
      const list = [...mine.filter((p) => p.name !== nm), { name: nm, model: next }]; setMine(list); writeJson(PRESETS_KEY, list); setPresetId(`u:${list.length - 1}`);
    } catch { setError(en ? 'Could not read the preset file.' : 'Не удалось прочитать файл пресета.'); }
  }

  // ---------- экспорт ----------
  async function doExport() {
    const file = fileRef.current; if (!file || busy) return;
    setError(''); cancelRef.current = false;
    try {
      setBusy({ stage: 'decode', p: 0 });
      const info = probe || await probeAudio(file);
      if (!bufRef.current) bufRef.current = await decodeNative(file, info, getAudioCtx());
      const buf = bufRef.current;
      setBusy({ stage: 'render', p: 0 });
      const out = await renderEq(buf, R.current.model, { onProgress: (p) => setBusy({ stage: 'render', p }), shouldCancel: () => cancelRef.current });
      if (protect && truePeakDb(out) > -1) truePeakLimit(out, buf.sampleRate, { ceilingDb: -1, releaseMs: 100 });
      setBusy({ stage: 'encode', p: 0 });
      const res = await encodeLike({ chans: out, sr: buf.sampleRate }, { ...info, size: file.size }, { target, onProgress: (p) => setBusy({ stage: 'encode', p }) });
      downloadBlob(res.blob, outputName(file.name, 'eq', res.ext));
    } catch (e) { if (e.message !== 'cancelled') { console.error(e); setError(String(e.message || e)); } }
    setBusy(null);
  }

  const choices = formatChoices(probe, language);
  const note = recompressNote(probe, target, language);
  const flat = isFlat(model) && Math.abs(preTotal) < 0.05;
  let maxResp = 0; for (const v of curve) if (v > maxResp) maxResp = v;
  const headroom = maxResp + preTotal; // > 0 дБ: усиленные места могут выйти за 0 дБFS

  if (!loaded) {
    return (
      <div className="tool-panel audio-eq">
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
        {loadErr && <p className="color-invalid">{loadErr}</p>}
        <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      </div>
    );
  }

  return (
    <div className="tool-panel audio-eq" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
      <div className="eq-head">
        <strong className="eq-file" title={name}>{name}</strong>
        <span className="eq-src">{probe ? `${t.src}: ${describeSource(probe)}` : ''}</span>
        <button type="button" className="tool-btn ghost small" onClick={() => inputRef.current?.click()}>{t.change}</button>
      </div>

      <div className="eq-transport">
        <button type="button" className="tool-btn primary" onClick={togglePlay}>{playing ? `⏸ ${t.pause}` : `▶ ${t.play}`}</button>
        <input className="eq-seek" type="range" min="0" max={duration || 1} step="0.05" value={Math.min(pos, duration || 1)} onChange={(e) => seek(Number(e.target.value))} aria-label="seek" />
        <span className="eq-time">{fmtTime(pos)} / {fmtTime(duration)}</span>
        <div className="segmented eq-ab" role="group" aria-label="A/B">
          <button type="button" className={!bypass ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setBypass(false)}>{t.on}</button>
          <button type="button" className={bypass ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setBypass(true)} title="B">{t.off}</button>
        </div>
      </div>

      <div className="eq-presets">
        <label className="eq-field"><span>{t.preset}</span>
          <select value={presetId} onChange={(e) => applyPreset(e.target.value)}>
            <option value="">{t.pick}</option>
            {PRESET_GROUPS.map(([g, ru, enL]) => (
              <optgroup key={g} label={en ? enL : ru}>{PRESETS.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{p[language] || p.ru}</option>)}</optgroup>
            ))}
            {mine.length > 0 && <optgroup label={t.mine}>{mine.map((p, i) => <option key={p.name} value={`u:${i}`}>{p.name}</option>)}</optgroup>}
          </select>
        </label>
        <button type="button" className="tool-btn ghost small" onClick={undo} disabled={!canUndo} title="Ctrl+Z">↶ {t.undo}</button>
        <button type="button" className="tool-btn ghost small" onClick={() => { setModel({ ...defaultModel(), autoPre: model.autoPre }); setPresetId(''); }}>{t.reset}</button>
        <input className="eq-name" value={presetName} placeholder={t.savePh} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') savePreset(); }} />
        <button type="button" className="tool-btn small" onClick={savePreset} disabled={!presetName.trim()}>{t.save}</button>
        {presetId.startsWith('u:') && <button type="button" className="tool-btn ghost small" onClick={deletePreset}>{t.del}</button>}
        <button type="button" className="tool-btn ghost small" onClick={exportPresetFile}>⬇ {t.exportPreset}</button>
        <button type="button" className="tool-btn ghost small" onClick={() => presetFileRef.current?.click()}>⬆ {t.importPreset}</button>
        <input ref={presetFileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { importPresetFile(e.target.files[0]); e.target.value = ''; }} />
      </div>

      <div ref={wrapRef} className="eq-graph-wrap">
        <canvas ref={canvasRef} className="eq-graph" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { hoverRef.current = -1; }} onDoubleClick={(e) => { const i = nearNode(e); if (i >= 0) patchBand(i, { gain: 0 }); }} />
      </div>
      <p className="eq-note">{t.graphHint} {advanced ? t.advHint : ''}</p>

      <div className="eq-bands" role="group" aria-label={t.band}>
        {model.bands.map((b, i) => (
          <div key={i} className={`eq-band${i === selected ? ' is-sel' : ''}${b.on ? '' : ' is-off'}`} onPointerDown={() => setSelected(i)}>
            <span className="eq-db">{b.gain > 0 ? '+' : ''}{b.gain.toFixed(1)}</span>
            <div className="eq-vwrap">
              <input className="eq-vslider" type="range" min={-GAIN_MAX} max={GAIN_MAX} step="0.5" value={b.gain} onChange={(e) => patchBand(i, { gain: Number(e.target.value) })} onDoubleClick={() => patchBand(i, { gain: 0 })} aria-label={`${bandLabel(b.f)} Hz`} />
            </div>
            <span className="eq-hz">{bandLabel(b.f)}</span>
          </div>
        ))}
      </div>

      <label className="tool-check"><input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> {t.advanced}</label>
      {advanced && (
        <div className="eq-table">
          <div className="eq-tr eq-th"><span>{t.band}</span><span>{t.type}</span><span>{t.freq}</span><span>{t.q}</span><span>{t.bandOn}</span></div>
          {model.bands.map((b, i) => (
            <div key={i} className={`eq-tr${i === selected ? ' is-sel' : ''}`} onPointerDown={() => setSelected(i)}>
              <span>{i + 1}</span>
              <select value={b.type} onChange={(e) => patchBand(i, { type: e.target.value })}>{BAND_TYPES.map((tp) => <option key={tp} value={tp}>{t.types[tp]}</option>)}</select>
              <input type="number" min="20" max="20000" step="1" value={Math.round(b.f)} onChange={(e) => patchBand(i, { f: Math.max(20, Math.min(20000, Number(e.target.value) || b.f)) })} />
              <input type="number" min="0.1" max="18" step="0.1" value={b.q} onChange={(e) => patchBand(i, { q: Math.max(0.1, Math.min(18, Number(e.target.value) || b.q)) })} />
              <input type="checkbox" checked={b.on} onChange={(e) => patchBand(i, { on: e.target.checked })} aria-label={t.bandOn} />
            </div>
          ))}
        </div>
      )}

      <div className="eq-filters">
        <div className="eq-flt">
          <label className="tool-check"><input type="checkbox" checked={model.hp.on} onChange={(e) => patchModel({ hp: { ...model.hp, on: e.target.checked } })} /> {t.hp}: <b>{model.hp.f} {en ? 'Hz' : 'Гц'}</b></label>
          <input type="range" min="20" max="500" step="5" value={model.hp.f} onChange={(e) => patchModel({ hp: { on: true, f: Number(e.target.value) } })} />
        </div>
        <div className="eq-flt">
          <label className="tool-check"><input type="checkbox" checked={model.lp.on} onChange={(e) => patchModel({ lp: { ...model.lp, on: e.target.checked } })} /> {t.lp}: <b>{model.lp.f >= 1000 ? `${(model.lp.f / 1000).toFixed(1)} ${en ? 'kHz' : 'кГц'}` : `${model.lp.f} ${en ? 'Hz' : 'Гц'}`}</b></label>
          <input type="range" min="2000" max="20000" step="100" value={model.lp.f} onChange={(e) => patchModel({ lp: { on: true, f: Number(e.target.value) } })} />
        </div>
        <div className="eq-flt">
          <label className="tool-check"><input type="checkbox" checked={model.autoPre} onChange={(e) => patchModel({ autoPre: e.target.checked })} /> {t.auto} <small>({autoPre.toFixed(1)} {en ? 'dB' : 'дБ'})</small></label>
          <label className="eq-flt-sl"><span>{t.pre}: <b>{model.pre > 0 ? '+' : ''}{model.pre.toFixed(1)} {en ? 'dB' : 'дБ'}</b></span><input type="range" min="-12" max="12" step="0.5" value={model.pre} onChange={(e) => patchModel({ pre: Number(e.target.value) })} onDoubleClick={() => patchModel({ pre: 0 })} /></label>
          <small className="eq-total">{t.preTotal(preTotal)}</small>
        </div>
      </div>
      {headroom > 0.05 && <p className="color-invalid">{t.clip}</p>}

      <div className="eq-export">
        <h3>{t.exportT}</h3>
        <div className="eq-export-row">
          <div className="tool-field"><span className="tool-field-label">{t.format}</span>
            <div className="segmented dm-seg">{choices.map((c) => <button key={c.id} type="button" className={target === c.id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTarget(c.id)}>{c.label}</button>)}</div>
          </div>
          <label className="tool-check"><input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} /> {t.protect}</label>
        </div>
        {note && <p className="eq-note">{note}</p>}
        {flat && <p className="eq-note">{t.flatNote}</p>}
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={doExport} disabled={!!busy}>{busy ? `${t.st[busy.stage]} ${busy.stage === 'render' || busy.stage === 'encode' ? `${Math.round((busy.p || 0) * 100)}%` : ''}` : t.go}</button>
          {busy && <button type="button" className="tool-btn ghost" onClick={() => { cancelRef.current = true; }}>{t.cancel}</button>}
        </div>
        {error && <p className="color-invalid">{error}</p>}
      </div>

      <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="eq-note">{t.keys}</p>
    </div>
  );
}

export default AudioEqualizer;
