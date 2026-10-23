import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob, getAudioCtx } from '../../utils/wav';
import {
  FORMAT_INFO, decodeNative, encodeLike, nearest, pickBitrate, probeAudio, resolveTarget,
} from '../../utils/audioFormat';
import FormatPicker from './shared/FormatPicker';
import { drawWave } from '../../utils/audioPeaks';
import {
  cutsFromSilences, equalCuts, everyCuts, findSilences, fmtStamp, parseTracklist, partFileName, sliceBuffer, snapToZero, suggestThreshold,
} from '../../utils/audioSlice';

// Нарезка аудио: волна с зумом → разметка (клик/двойной клик/«S» на лету, паузы с настройкой и
// предпросмотром, равные части, список таймкодов с названиями) → правка резов перетаскиванием →
// части с именами → скачать по одной или ZIP. Всё локально.

const TEXT = {
  ru: {
    drop: 'Загрузите аудио — микс, альбом, подкаст, запись', hint: 'MP3, WAV, M4A, OGG, FLAC — всё локально, без загрузки на сервер', decoding: 'Читаю аудио…', change: 'Другой файл',
    play: 'Играть', pause: 'Пауза', cutHere: 'Разрезать здесь', clear: 'Убрать все резы', undo: 'Отменить',
    parts: 'Части', partsEmpty: 'Резов пока нет — весь файл одна часть. Дважды кликните по волне, нажмите S во время прослушивания или используйте авторазметку.',
    modeSilence: 'По паузам', modeEqual: 'Равные части', modeList: 'Список таймкодов',
    thr: 'Порог тишины', thrAuto: 'Подобрать', pause2: 'Пауза не короче', piece: 'Кусок не короче', found: (p, c) => `Найдено пауз: ${p} → кусков: ${c}`, applySil: (c) => `Разметить (${c} ${plural(c, 'кусок', 'куска', 'кусков')})`,
    silNote: 'Красным — найденные паузы, пунктиром — где пройдут резы (в самом тихом месте паузы). Подвигайте ползунки и смотрите на волну.',
    byCount: 'На N частей', byEvery: 'Каждые N секунд', nParts: 'Частей', everySec: 'Секунд', willBe: (n) => `Получится частей: ${n}`, applyEq: 'Разметить',
    listHint: 'Вставьте таймкоды: «00:00 Интро», «03:21 — Первая песня», «[1:02:03] Финал». Подойдут и метки Audacity.', applyList: 'Разметить по списку', copyList: 'Скопировать таймкоды', copied: 'Скопировано', listNone: 'Таймкодов не нашлось',
    name: 'Название', partN: (n) => `Часть ${n}`, include: 'В экспорт', dl: 'Скачать эту часть', merge: 'Убрать рез перед частью', playPart: 'Слушать часть',
    format: 'Формат', quality: 'Битрейт, кбит/с', fade: 'Фейд на краях, мс', snap: 'Резать по нулю (без щелчков)',
    zip: (n) => `Скачать ZIP (${n})`, encoding: (i, n) => `Кодирую ${i} из ${n}…`, est: (s) => `≈ ${s}`,
    keys: 'Клавиши: Пробел — играть/пауза · S — разрезать здесь · ←/→ — ±1 с (Shift — ±10 с) · Ctrl+Z — отменить · колесо мыши — зум, Shift+колесо — прокрутка · двойной клик — добавить рез · правый клик по резу — удалить.',
    zoomIn: 'Приблизить', zoomOut: 'Отдалить', zoomFit: 'Весь трек', noneIncluded: 'Нет частей для экспорта', wavNote: 'По умолчанию части сохраняются в исходном формате (MP3 → MP3, FLAC → FLAC, WAV той же битности). WAV и MP3 кодируются сразу, остальные форматы — через FFmpeg (≈30 МБ, один раз).',
  },
  en: {
    drop: 'Upload audio — a mix, album, podcast, recording', hint: 'MP3, WAV, M4A, OGG, FLAC — all local, nothing is uploaded', decoding: 'Reading audio…', change: 'Another file',
    play: 'Play', pause: 'Pause', cutHere: 'Cut here', clear: 'Remove all cuts', undo: 'Undo',
    parts: 'Parts', partsEmpty: 'No cuts yet — the whole file is one part. Double-click the waveform, press S while listening, or use auto-split.',
    modeSilence: 'By silence', modeEqual: 'Equal parts', modeList: 'Timestamp list',
    thr: 'Silence threshold', thrAuto: 'Auto', pause2: 'Pause at least', piece: 'Part at least', found: (p, c) => `Pauses found: ${p} → parts: ${c}`, applySil: (c) => `Split (${c} ${c === 1 ? 'part' : 'parts'})`,
    silNote: 'Red = detected pauses, dashed = where the cuts will go (the quietest spot of each pause). Move the sliders and watch the waveform.',
    byCount: 'Into N parts', byEvery: 'Every N seconds', nParts: 'Parts', everySec: 'Seconds', willBe: (n) => `Parts: ${n}`, applyEq: 'Split',
    listHint: 'Paste timestamps: “00:00 Intro”, “03:21 — First song”, “[1:02:03] Finale”. Audacity labels work too.', applyList: 'Split by list', copyList: 'Copy timestamps', copied: 'Copied', listNone: 'No timestamps found',
    name: 'Name', partN: (n) => `Part ${n}`, include: 'Export', dl: 'Download this part', merge: 'Remove the cut before this part', playPart: 'Listen to this part',
    format: 'Format', quality: 'Bitrate, kbps', fade: 'Edge fade, ms', snap: 'Cut at zero crossings (no clicks)',
    zip: (n) => `Download ZIP (${n})`, encoding: (i, n) => `Encoding ${i} of ${n}…`, est: (s) => `≈ ${s}`,
    keys: 'Keys: Space — play/pause · S — cut here · ←/→ — ±1 s (Shift — ±10 s) · Ctrl+Z — undo · mouse wheel — zoom, Shift+wheel — scroll · double-click — add a cut · right-click a cut — delete it.',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomFit: 'Whole track', noneIncluded: 'No parts to export', wavNote: 'Parts are saved in the source format by default (MP3 → MP3, FLAC → FLAC, WAV at the same bit depth). WAV and MP3 encode instantly, other formats go through FFmpeg (≈30 MB, once).',
  },
};

const plural = (n, one, few, many) => { const m = n % 100; const d = n % 10; return m >= 11 && m <= 14 ? many : d === 1 ? one : d >= 2 && d <= 4 ? few : many; };
const MIN_GAP = 0.05; // не ближе 50 мс друг к другу и к краям
const RULER = 18;
const WAVE_H = 150;
const QUALITY = [96, 128, 192, 256, 320];
const chansOf = (b) => Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
const stamp = (s) => fmtStamp(s, 1);
const humanSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);

let idCounter = 0;
const newId = () => { idCounter += 1; return `m${idCounter}`; };

function niceStep(pxPerSec) {
  for (const s of [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600]) if (s * pxPerSec >= 90) return s;
  return 7200;
}

function AudioSlicer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const en = language === 'en';
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const overRef = useRef(null);
  const playRef = useRef(null);
  const dragRef = useRef(null);
  const undoRef = useRef([]);
  const [buf, setBuf] = useState(null);
  const [name, setName] = useState('');
  const [decoding, setDecoding] = useState(false);
  const [markers, setMarkers] = useState([]); // [{ id, t }] по возрастанию
  const [meta, setMeta] = useState({}); // id начала части → { name, off }
  const [view, setView] = useState({ t0: 0, span: 1 });
  const [width, setWidth] = useState(800);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [mode, setMode] = useState('silence');
  const [thr, setThr] = useState(-40);
  const [minPause, setMinPause] = useState(0.5);
  const [minPiece, setMinPiece] = useState(1);
  const [eqKind, setEqKind] = useState('count');
  const [eqParts, setEqParts] = useState(4);
  const [eqEvery, setEqEvery] = useState(60);
  const [listText, setListText] = useState('');
  const [listMsg, setListMsg] = useState('');
  const [fmt, setFmt] = useState('source');
  const [probe, setProbe] = useState(null);
  const [bitrate, setBitrate] = useState(192);
  const [fade, setFade] = useState(5);
  const [snap, setSnap] = useState(true);
  const [busy, setBusy] = useState(null); // { i, n } | null
  const [silences, setSilences] = useState([]);

  const duration = buf ? buf.duration : 0;
  const R = useRef({});
  R.current = { buf, markers, view, pos, snap, duration, playing, width };

  const segs = useMemo(() => {
    const edges = [0, ...markers.map((m) => m.t), duration];
    return edges.slice(0, -1).map((a, i) => ({ i, a, b: edges[i + 1], id: i === 0 ? 'S' : markers[i - 1].id }));
  }, [markers, duration]);
  const included = segs.filter((s) => !meta[s.id]?.off);

  // ---------- загрузка ----------
  async function loadFile(file) {
    if (!file) return;
    stopPlay(); setDecoding(true);
    try {
      const info = await probeAudio(file); setProbe(info);
      const b = await decodeNative(file, info, getAudioCtx());
      undoRef.current = []; setCanUndo(false);
      setBuf(b); setName(file.name.replace(/\.[^.]+$/, '')); setMarkers([]); setMeta({}); setSelected(0); setPos(0);
      setView({ t0: 0, span: b.duration });
      setThr(suggestThreshold(chansOf(b), b.sampleRate));
    } catch (e) { console.error(e); }
    setDecoding(false);
  }

  useEffect(() => {
    const el = wrapRef.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.max(300, Math.floor(el.clientWidth))));
    ro.observe(el); setWidth(Math.max(300, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, [buf]);

  // паузы для предпросмотра: считаем с небольшой задержкой, чтобы ползунок не тормозил
  useEffect(() => {
    if (!buf || mode !== 'silence') { setSilences([]); return undefined; }
    const id = setTimeout(() => setSilences(findSilences(chansOf(buf), buf.sampleRate, { thrDb: thr, minPause })), 120);
    return () => clearTimeout(id);
  }, [buf, mode, thr, minPause]);
  const silenceCuts = useMemo(() => (mode === 'silence' ? cutsFromSilences(silences, duration, minPiece) : []), [mode, silences, duration, minPiece]);

  // ---------- разметка ----------
  function pushUndo() {
    undoRef.current.push({ markers: R.current.markers, meta });
    if (undoRef.current.length > 50) undoRef.current.shift();
    setCanUndo(true);
  }
  function undo() {
    const s = undoRef.current.pop(); if (!s) return;
    setMarkers(s.markers); setMeta(s.meta); setCanUndo(undoRef.current.length > 0);
  }
  function snapped(tm) { return R.current.snap ? snapToZero(chansOf(R.current.buf), R.current.buf.sampleRate, tm, 8) : tm; }
  function addCut(tm) {
    const { markers: ms, duration: d } = R.current;
    const at = snapped(tm);
    if (at < MIN_GAP || at > d - MIN_GAP || ms.some((m) => Math.abs(m.t - at) < MIN_GAP)) return;
    pushUndo();
    const next = [...ms, { id: newId(), t: at }].sort((a, b) => a.t - b.t);
    setMarkers(next);
    setSelected(next.findIndex((m) => m.t === at) + 1);
  }
  function applyCuts(cuts, names = []) {
    if (!buf) return;
    pushUndo();
    const clean = []; let last = 0;
    for (const c of [...cuts].sort((a, b) => a - b)) {
      const at = snapped(c);
      if (at - last >= MIN_GAP && duration - at >= MIN_GAP) { clean.push({ id: newId(), t: at, name: names[cuts.indexOf(c) + 1] }); last = at; }
    }
    const m = {}; if (names[0]) m.S = { name: names[0] };
    clean.forEach((x) => { if (x.name) m[x.id] = { name: x.name }; });
    setMarkers(clean.map(({ id, t: tm }) => ({ id, t: tm }))); setMeta(m); setSelected(0);
    setView({ t0: 0, span: duration });
  }
  function clearCuts() { if (!markers.length) return; pushUndo(); setMarkers([]); setMeta({}); setSelected(0); }
  function removeCut(id) {
    pushUndo(); setMarkers((ms) => ms.filter((m) => m.id !== id));
    setMeta((m) => { const n = { ...m }; delete n[id]; return n; });
  }
  function setPart(id, patch) { setMeta((m) => ({ ...m, [id]: { ...m[id], ...patch } })); }

  const eqCuts = useMemo(() => (eqKind === 'count' ? equalCuts(duration, eqParts) : everyCuts(duration, eqEvery)), [eqKind, eqParts, eqEvery, duration]);

  function applyList() {
    const items = parseTracklist(listText).filter((x) => x.t < duration - MIN_GAP);
    if (!items.length) { setListMsg(t.listNone); return; }
    setListMsg('');
    const first = items[0].t < 0.5;
    const cutItems = first ? items.slice(1) : items;
    applyCuts(cutItems.map((x) => x.t), [first ? items[0].name : '', ...cutItems.map((x) => x.name)]);
  }
  async function copyList() {
    const lines = segs.map((s) => `${fmtStamp(s.a)} ${meta[s.id]?.name || t.partN(s.i + 1)}`).join('\n');
    try { await navigator.clipboard.writeText(lines); setListMsg(t.copied); } catch { setListText(lines); }
  }

  // ---------- проигрывание ----------
  function stopPlay() {
    const p = playRef.current; playRef.current = null;
    if (p) { try { p.src.onended = null; p.src.stop(); } catch { /* */ } }
    setPlaying(false);
  }
  function play(from, to) {
    const b = R.current.buf; if (!b) return;
    stopPlay();
    const ctx = getAudioCtx(); if (ctx.state === 'suspended') ctx.resume();
    const end = to ?? b.duration; const start = Math.max(0, Math.min(from, end - 0.01));
    const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination);
    src.start(0, start, end - start);
    const p = { src, ctxT: ctx.currentTime, from: start, to: end };
    src.onended = () => { if (playRef.current === p) { playRef.current = null; setPlaying(false); setPos(end); } };
    playRef.current = p; setPlaying(true); setPos(start);
  }
  function toggle() {
    if (R.current.playing) { const p = playRef.current; const at = p ? Math.min(p.to, p.from + (getAudioCtx().currentTime - p.ctxT)) : R.current.pos; stopPlay(); setPos(at); return; }
    const from = R.current.pos >= R.current.duration - 0.05 ? 0 : R.current.pos;
    play(from);
  }
  function seek(tm) {
    const at = Math.max(0, Math.min(R.current.duration, tm));
    setPos(at);
    const p = playRef.current; if (p) play(at, p.to);
  }
  function playPart(s) {
    const p = playRef.current;
    if (p && p.from === s.a && p.to === s.b) { stopPlay(); return; }
    setSelected(s.i); play(s.a, s.b);
  }

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      const p = playRef.current; if (!p) return;
      const at = Math.min(p.to, p.from + (getAudioCtx().currentTime - p.ctxT));
      setPos(at);
      const { view: v } = R.current; // за кадром — прокрутить, чтобы курсор был виден
      if (at > v.t0 + v.span * 0.97 || at < v.t0) setView({ ...v, t0: Math.max(0, Math.min(R.current.duration - v.span, at - v.span * 0.1)) });
      const idx = segs.findIndex((s) => at >= s.a && at < s.b); if (idx >= 0) setSelected(idx);
    }, 40);
    return () => clearInterval(id);
  }, [playing, segs]);

  useEffect(() => () => stopPlay(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- клавиши ----------
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target; const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (!R.current.buf) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
      if (mod || e.altKey) return;
      if (e.code === 'Space' && tag !== 'BUTTON') { e.preventDefault(); toggle(); } else if (e.code === 'KeyS') { e.preventDefault(); addCut(R.current.pos); } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault(); seek(R.current.pos + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // каждый рендер: обработчик видит свежие closures

  // ---------- зум и прокрутка ----------
  const clampView = (t0, span) => {
    const d = R.current.duration; const sp = Math.max(0.05, Math.min(d, span));
    return { t0: Math.max(0, Math.min(d - sp, t0)), span: sp };
  };
  function zoomAt(factor, anchor) {
    const v = R.current.view; const sp = v.span * factor;
    const a = anchor ?? v.t0 + v.span / 2;
    const frac = (a - v.t0) / v.span;
    setView(clampView(a - frac * sp, sp));
  }
  useEffect(() => {
    const c = canvasRef.current; if (!c) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const { view: v, width: w } = R.current;
      const rect = c.getBoundingClientRect(); const tm = v.t0 + ((e.clientX - rect.left) / rect.width) * v.span;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setView(clampView(v.t0 + ((e.deltaX || e.deltaY) / w) * v.span, v.span));
      } else zoomAt(Math.exp(e.deltaY * 0.0015), tm);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [buf]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- рисование ----------
  const cssVar = (el, name, fb) => (getComputedStyle(el).getPropertyValue(name).trim() || fb);
  useEffect(() => {
    const c = canvasRef.current; if (!c || !buf) return;
    const dpr = window.devicePixelRatio || 1; const w = width; const h = WAVE_H + RULER;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.height = `${h}px`;
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
    const accent = cssVar(c, '--t-accent', '#6166ff'); const muted = cssVar(c, '--text-muted', '#9aa0b8'); const stroke = cssVar(c, '--stroke-strong', '#3a3d52');
    const pps = w / view.span; const X = (tm) => (tm - view.t0) * pps;
    // части
    segs.forEach((s) => {
      const x0 = Math.max(0, X(s.a)); const x1 = Math.min(w, X(s.b)); if (x1 <= 0 || x0 >= w) return;
      x.globalAlpha = s.i === selected ? 0.2 : s.i % 2 ? 0.1 : 0.04; x.fillStyle = accent; x.fillRect(x0, RULER, x1 - x0, WAVE_H); x.globalAlpha = 1;
      if (meta[s.id]?.off) { x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(x0, RULER, x1 - x0, WAVE_H); }
    });
    // волна
    x.save(); x.translate(0, RULER);
    drawWave(x, buf, { t0: view.t0, pxPerSec: pps, w, h: WAVE_H, color: muted, rmsColor: accent });
    x.restore();
    // паузы и предполагаемые резы
    if (mode === 'silence') {
      x.fillStyle = 'rgba(255,90,90,0.22)';
      silences.forEach((s) => { const x0 = X(s.from); const x1 = X(s.to); if (x1 > 0 && x0 < w) x.fillRect(x0, RULER, Math.max(1, x1 - x0), WAVE_H); });
      x.strokeStyle = accent; x.setLineDash([5, 4]); x.lineWidth = 1.5;
      silenceCuts.forEach((tm) => { const px = X(tm); if (px >= 0 && px <= w) { x.beginPath(); x.moveTo(px, RULER); x.lineTo(px, RULER + WAVE_H); x.stroke(); } });
      x.setLineDash([]);
    } else if (mode === 'equal') {
      x.strokeStyle = accent; x.setLineDash([5, 4]); x.lineWidth = 1.5;
      eqCuts.forEach((tm) => { const px = X(tm); if (px >= 0 && px <= w) { x.beginPath(); x.moveTo(px, RULER); x.lineTo(px, RULER + WAVE_H); x.stroke(); } });
      x.setLineDash([]);
    }
    // линейка
    x.fillStyle = muted; x.strokeStyle = stroke; x.font = '11px system-ui, sans-serif'; x.lineWidth = 1;
    const step = niceStep(pps);
    for (let tm = Math.ceil(view.t0 / step) * step; tm < view.t0 + view.span; tm += step) {
      const px = Math.round(X(tm)) + 0.5; x.beginPath(); x.moveTo(px, RULER - 5); x.lineTo(px, RULER); x.stroke();
      x.fillText(fmtStamp(tm, step < 1 ? 1 : 0), px + 3, 11);
    }
    // резы и номера частей
    x.lineWidth = 2; x.strokeStyle = accent; x.fillStyle = accent;
    markers.forEach((m) => {
      const px = X(m.t); if (px < -2 || px > w + 2) return;
      x.beginPath(); x.moveTo(px, RULER); x.lineTo(px, h); x.stroke();
      x.beginPath(); x.moveTo(px - 6, RULER); x.lineTo(px + 6, RULER); x.lineTo(px, RULER + 9); x.closePath(); x.fill();
    });
    x.font = '600 12px system-ui, sans-serif';
    segs.forEach((s) => { const px = X(s.a); if (X(s.b) - px > 22 && px > -2 && px < w - 10) { x.fillStyle = muted; x.fillText(String(s.i + 1), Math.max(4, px + 6), RULER + 24); } });
    // курсор
    const cp = X(pos); if (cp >= 0 && cp <= w) { x.fillStyle = '#fff'; x.fillRect(cp - 1, 0, 2, h); }
  }, [buf, view, width, markers, meta, selected, pos, mode, silences, silenceCuts, eqCuts, segs]);

  useEffect(() => {
    const c = overRef.current; if (!c || !buf) return;
    const dpr = window.devicePixelRatio || 1; const w = width; const h = 38;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.height = `${h}px`;
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
    const accent = cssVar(c, '--t-accent', '#6166ff'); const muted = cssVar(c, '--text-muted', '#9aa0b8');
    drawWave(x, buf, { t0: 0, pxPerSec: w / duration, w, h, color: muted });
    x.fillStyle = accent; markers.forEach((m) => x.fillRect((m.t / duration) * w - 1, 0, 2, h));
    const vx = (view.t0 / duration) * w; const vw = Math.max(6, (view.span / duration) * w);
    x.globalAlpha = 0.25; x.fillStyle = accent; x.fillRect(vx, 0, vw, h); x.globalAlpha = 1; x.strokeStyle = accent; x.lineWidth = 2; x.strokeRect(vx + 1, 1, vw - 2, h - 2);
    x.fillStyle = '#fff'; x.fillRect((pos / duration) * w - 1, 0, 2, h);
  }, [buf, view, width, markers, pos, duration]);

  // ---------- мышь ----------
  const timeAt = (e) => { const r = canvasRef.current.getBoundingClientRect(); return view.t0 + ((e.clientX - r.left) / r.width) * view.span; };
  const nearMarker = (e) => {
    const r = canvasRef.current.getBoundingClientRect(); const pps = r.width / view.span;
    const tm = timeAt(e); let best = null; let bd = 8 / pps;
    markers.forEach((m) => { const d = Math.abs(m.t - tm); if (d < bd) { best = m; bd = d; } });
    return best;
  };
  function onDown(e) {
    if (e.button !== 0) return;
    canvasRef.current.setPointerCapture?.(e.pointerId);
    const m = nearMarker(e);
    if (m) { pushUndo(); dragRef.current = { id: m.id }; return; }
    const at = Math.max(0, Math.min(duration, timeAt(e)));
    dragRef.current = { scrub: true, at }; setPos(at);
    const idx = segs.findIndex((s) => at >= s.a && at < s.b); if (idx >= 0) setSelected(idx);
  }
  function onMove(e) {
    const d = dragRef.current;
    if (!d) { canvasRef.current.style.cursor = nearMarker(e) ? 'ew-resize' : 'pointer'; return; }
    const tm = timeAt(e);
    if (d.scrub) { d.at = Math.max(0, Math.min(duration, tm)); setPos(d.at); return; }
    setMarkers((ms) => {
      const i = ms.findIndex((m) => m.id === d.id); if (i < 0) return ms;
      const lo = (i ? ms[i - 1].t : 0) + MIN_GAP; const hi = (i < ms.length - 1 ? ms[i + 1].t : duration) - MIN_GAP;
      const next = ms.slice(); next[i] = { ...ms[i], t: Math.max(lo, Math.min(hi, tm)) }; return next;
    });
  }
  function onUp() {
    const d = dragRef.current; dragRef.current = null;
    if (d?.scrub) { const p = playRef.current; if (p) play(d.at, p.to); }
    if (d?.id && snap) setMarkers((ms) => ms.map((m) => (m.id === d.id ? { ...m, t: snapToZero(chansOf(buf), buf.sampleRate, m.t, 8) } : m)));
  }
  function onOverDown(e) {
    const r = overRef.current.getBoundingClientRect();
    const set = (ev) => { const tm = ((ev.clientX - r.left) / r.width) * duration; setView(clampView(tm - view.span / 2, view.span)); };
    set(e); overRef.current.setPointerCapture?.(e.pointerId);
    overRef.current.onpointermove = set; overRef.current.onpointerup = () => { overRef.current.onpointermove = null; overRef.current.onpointerup = null; };
  }

  // ---------- экспорт ----------
  const targetId = resolveTarget(fmt, probe).id;
  const lossyExplicit = fmt !== 'source' && !!FORMAT_INFO[targetId]?.rates.length;
  const qualityList = lossyExplicit ? QUALITY.filter((q) => FORMAT_INFO[targetId].rates.includes(q) || q === 128) : [];
  useEffect(() => { if (qualityList.length && !qualityList.includes(bitrate)) setBitrate(nearest(qualityList, bitrate)); }, [fmt]); // eslint-disable-line react-hooks/exhaustive-deps

  async function encodePart(s) {
    const slice = sliceBuffer(buf, s.a, s.b, fade);
    const r = await encodeLike(slice, { ...probe, size: 0 }, { target: fmt, bitrate: lossyExplicit ? bitrate : undefined });
    return { blob: r.blob, ext: r.ext };
  }
  const fileName = (s, ext) => partFileName(name, s.i, segs.length, meta[s.id]?.name, ext);

  async function downloadOne(s) {
    setBusy({ i: 1, n: 1 });
    try { const { blob, ext } = await encodePart(s); downloadBlob(blob, fileName(s, ext)); } catch (e) { console.error(e); }
    setBusy(null);
  }
  async function downloadZip() {
    if (!included.length) return;
    try {
      const files = {}; const used = new Set();
      for (let k = 0; k < included.length; k += 1) {
        setBusy({ i: k + 1, n: included.length });
        const { blob, ext } = await encodePart(included[k]); // eslint-disable-line no-await-in-loop
        let nm = fileName(included[k], ext); while (used.has(nm)) nm = `_${nm}`; used.add(nm);
        files[nm] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]; // eslint-disable-line no-await-in-loop
      }
      const { zipSync } = await import('fflate');
      downloadBlob(new Blob([zipSync(files)], { type: 'application/zip' }), `${name || 'audio'}-parts.zip`);
    } catch (e) { console.error(e); }
    setBusy(null);
  }
  const estBytes = (s) => {
    const d = s.b - s.a; const bytes = Math.min(2, buf.numberOfChannels) * buf.sampleRate * d;
    if (targetId === 'wav') return bytes * (fmt === 'source' && probe?.bits >= 24 ? (probe.bits >= 32 ? 4 : 3) : fmt === 'source' ? 2 : 3);
    if (targetId === 'flac') return bytes * 1.5;
    const kbps = fmt === 'source' ? pickBitrate(targetId, probe?.bitrate, probe?.size, buf.duration) : bitrate;
    return (d * (kbps || 192) * 1000) / 8;
  };
  const totalEst = buf ? included.reduce((a, s) => a + estBytes(s), 0) : 0;

  const seg = (v, set, list) => <div className="segmented dm-seg">{list.map(([id, l]) => <button key={id} type="button" className={v === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set(id)}>{l}</button>)}</div>;
  const num = (v, set, min, max, step = 1) => <input className="as-num" type="number" min={min} max={max} step={step} value={v} onChange={(e) => set(Math.max(min, Math.min(max, Number(e.target.value) || min)))} />;

  if (!buf) {
    return (
      <div className="tool-panel audio-slicer">
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{decoding ? t.decoding : t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
        <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      </div>
    );
  }

  return (
    <div className="tool-panel audio-slicer" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
      <div className="as-head">
        <strong className="as-file" title={name}>{name}</strong>
        <span className="as-dur">{fmtStamp(duration)} · {buf.numberOfChannels === 1 ? 'mono' : 'stereo'} · {Math.round(buf.sampleRate / 100) / 10} kHz</span>
        <button type="button" className="tool-btn ghost small" onClick={() => inputRef.current?.click()}>{t.change}</button>
      </div>

      <div className="as-transport">
        <button type="button" className="tool-btn primary" onClick={toggle}>{playing ? `⏸ ${t.pause}` : `▶ ${t.play}`}</button>
        <span className="as-time">{stamp(pos)} / {stamp(duration)}</span>
        <button type="button" className="tool-btn" onClick={() => addCut(pos)} title="S">✂ {t.cutHere} <kbd>S</kbd></button>
        <button type="button" className="tool-btn ghost" onClick={undo} disabled={!canUndo} title="Ctrl+Z">↶ {t.undo}</button>
        <button type="button" className="tool-btn ghost" onClick={clearCuts} disabled={!markers.length}>{t.clear}</button>
        <span className="as-zoom">
          <button type="button" className="tool-btn ghost small" onClick={() => zoomAt(0.5)} title={t.zoomIn} aria-label={t.zoomIn}>＋</button>
          <button type="button" className="tool-btn ghost small" onClick={() => zoomAt(2)} title={t.zoomOut} aria-label={t.zoomOut}>−</button>
          <button type="button" className="tool-btn ghost small" onClick={() => setView({ t0: 0, span: duration })} title={t.zoomFit}>⤢</button>
        </span>
      </div>

      <div ref={wrapRef} className="as-wave-wrap">
        <canvas
          ref={canvasRef} className="as-wave" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onDoubleClick={(e) => { if (!nearMarker(e)) addCut(timeAt(e)); }}
          onContextMenu={(e) => { const m = nearMarker(e); if (m) { e.preventDefault(); removeCut(m.id); } }}
        />
        <canvas ref={overRef} className="as-over" onPointerDown={onOverDown} aria-label="overview" />
      </div>

      <div className="as-auto">
        {seg(mode, setMode, [['silence', t.modeSilence], ['equal', t.modeEqual], ['list', t.modeList]])}
        {mode === 'silence' && (
          <div className="as-auto-body">
            <label className="as-sl"><span>{t.thr}: <b>{thr} дБ</b> <button type="button" className="as-link" onClick={() => setThr(suggestThreshold(chansOf(buf), buf.sampleRate))}>{t.thrAuto}</button></span><input type="range" min="-70" max="-10" step="1" value={thr} onChange={(e) => setThr(Number(e.target.value))} /></label>
            <label className="as-sl"><span>{t.pause2}: <b>{minPause.toFixed(2)} {en ? 's' : 'с'}</b></span><input type="range" min="0.1" max="5" step="0.05" value={minPause} onChange={(e) => setMinPause(Number(e.target.value))} /></label>
            <label className="as-sl"><span>{t.piece}: <b>{minPiece.toFixed(1)} {en ? 's' : 'с'}</b></span><input type="range" min="0.2" max="120" step="0.1" value={minPiece} onChange={(e) => setMinPiece(Number(e.target.value))} /></label>
            <div className="as-auto-act">
              <span className="as-found">{t.found(silences.length, silenceCuts.length + 1)}</span>
              <button type="button" className="tool-btn primary" disabled={!silenceCuts.length} onClick={() => applyCuts(silenceCuts)}>{t.applySil(silenceCuts.length + 1)}</button>
            </div>
            <p className="as-note">{t.silNote}</p>
          </div>
        )}
        {mode === 'equal' && (
          <div className="as-auto-body">
            <div className="as-row">
              {seg(eqKind, setEqKind, [['count', t.byCount], ['every', t.byEvery]])}
              {eqKind === 'count' ? <label className="as-inl">{t.nParts} {num(eqParts, setEqParts, 2, 500)}</label> : <label className="as-inl">{t.everySec} {num(eqEvery, setEqEvery, 1, 36000)}</label>}
              <span className="as-found">{t.willBe(eqCuts.length + 1)}</span>
              <button type="button" className="tool-btn primary" disabled={!eqCuts.length} onClick={() => applyCuts(eqCuts)}>{t.applyEq}</button>
            </div>
          </div>
        )}
        {mode === 'list' && (
          <div className="as-auto-body">
            <p className="as-note">{t.listHint}</p>
            <textarea className="as-list" rows={5} value={listText} onChange={(e) => setListText(e.target.value)} placeholder={'00:00 Intro\n03:21 First song\n07:45 Second song'} spellCheck={false} />
            <div className="as-row">
              <button type="button" className="tool-btn primary" disabled={!listText.trim()} onClick={applyList}>{t.applyList}</button>
              <button type="button" className="tool-btn ghost" onClick={copyList}>{t.copyList}</button>
              {listMsg && <span className="as-found" role="status">{listMsg}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="as-parts-head">
        <h3>{t.parts} <span className="as-count">{segs.length}</span></h3>
        <div className="as-export">
          <FormatPicker probe={probe} value={fmt} onChange={setFmt} language={language} label={t.format} />
          {qualityList.length > 0 && <label className="as-inl">{t.quality} {seg(bitrate, setBitrate, qualityList.map((b) => [b, String(b)]))}</label>}
          <label className="as-inl">{t.fade} {num(fade, setFade, 0, 500)}</label>
          <label className="tool-check"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> {t.snap}</label>
        </div>
      </div>
      {segs.length === 1 && <p className="as-note">{t.partsEmpty}</p>}

      <ul className="as-parts">
        {segs.map((s) => {
          const mt = meta[s.id] || {};
          return (
            <li key={s.id} className={`as-part${s.i === selected ? ' is-sel' : ''}${mt.off ? ' is-off' : ''}`} onClick={() => { setSelected(s.i); if (!playing) setPos(s.a); setView((v) => (s.a < v.t0 || s.a > v.t0 + v.span ? clampView(s.a - v.span * 0.1, v.span) : v)); }}>
              <button type="button" className="tool-btn ghost small as-pp" onClick={(e) => { e.stopPropagation(); playPart(s); }} title={t.playPart} aria-label={t.playPart}>{playing && playRef.current?.from === s.a && playRef.current?.to === s.b ? '⏸' : '▶'}</button>
              <span className="as-idx">{s.i + 1}</span>
              <input className="as-name" value={mt.name || ''} placeholder={t.partN(s.i + 1)} onClick={(e) => e.stopPropagation()} onChange={(e) => setPart(s.id, { name: e.target.value })} aria-label={t.name} />
              <span className="as-range">{stamp(s.a)} – {stamp(s.b)}</span>
              <span className="as-len">{fmtStamp(s.b - s.a, 1)}<small>{t.est(humanSize(estBytes(s)))}</small></span>
              <label className="tool-check as-inc" onClick={(e) => e.stopPropagation()} title={t.include}><input type="checkbox" checked={!mt.off} onChange={(e) => setPart(s.id, { off: !e.target.checked })} /></label>
              <button type="button" className="tool-btn ghost small" disabled={!!busy} onClick={(e) => { e.stopPropagation(); downloadOne(s); }} title={t.dl} aria-label={t.dl}>⬇</button>
              {s.i > 0 ? <button type="button" className="tool-btn ghost small" onClick={(e) => { e.stopPropagation(); removeCut(s.id); }} title={t.merge} aria-label={t.merge}>✕</button> : <span className="as-ph" />}
            </li>
          );
        })}
      </ul>

      <div className="tool-actions">
        <button type="button" className="tool-btn primary" onClick={downloadZip} disabled={!!busy || !included.length}>
          {busy ? t.encoding(busy.i, busy.n) : included.length ? t.zip(included.length) : t.noneIncluded}
        </button>
        {!busy && included.length > 0 && <span className="as-found">{t.est(humanSize(totalEst))}</span>}
      </div>

      <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.wavNote}</p>
      <p className="as-keys">{t.keys}</p>
    </div>
  );
}

export default AudioSlicer;
