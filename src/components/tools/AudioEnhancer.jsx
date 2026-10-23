import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getAudioCtx } from '../../utils/wav';
import { encodeLike, probeAudio } from '../../utils/audioFormat';

// Улучшение аудио 2.0 — локальный движок в Web Worker (src/audio-engine):
// диагностика → роутер → специализированные стадии. Речь: declip → подавление эха комнаты →
// DeepFilterNet3 → динамический EQ → лэвелер → компрессор → LUFS → true-peak.
// Музыка: без речевой нейросети; гул/клиппинг/шипение, резонансы, восстановление
// среза MP3 (SBR), динамический EQ, дрейф тембра, мастеринг по референсу.

const MODES = [
  { id: 'auto', ru: 'Авто', en: 'Auto', hint: { ru: 'Сам определит речь или музыку и соберёт цепочку под найденные дефекты.', en: 'Detects speech or music and builds a chain for the defects it finds.' } },
  { id: 'voice', ru: 'Голос', en: 'Voice', hint: { ru: 'Подкаст, видео, войс: DeepFilterNet3, динамический EQ, ровная громкость.', en: 'Podcast, video, voice-over: DeepFilterNet3, dynamic EQ, even loudness.' } },
  { id: 'podcast', ru: 'Подкаст', en: 'Podcast', hint: { ru: 'Шире полоса, чем у «Голоса»: 60 Гц – 16 кГц, естественнее тембр. Для подкастов, интервью, закадра.', en: 'A wider band than “Voice”: 60 Hz – 16 kHz, more natural tone. For podcasts, interviews, voice-over.' } },
  { id: 'restore', ru: 'Реставрация речи', en: 'Speech restore', hint: { ru: 'Тяжёлые записи: клиппинг, эхо комнаты, щелчки, сильный шум — всё агрессивнее.', en: 'Rough recordings: clipping, room echo, clicks, heavy noise — everything stronger.' } },
  { id: 'music', ru: 'Музыка', en: 'Music', hint: { ru: 'Бережно: без речевой нейросети, которая ест тарелки и пэды. Шипение, резкость, срез MP3, финал.', en: 'Gentle: no speech network that eats cymbals and pads. Hiss, harshness, MP3 cutoff, finish.' } },
  { id: 'ai', ru: 'AI-музыка', en: 'AI music', hint: { ru: 'Suno / Udio: металлический звон, «физ» на верху, сибилянты, плывущий тембр, срез экспорта.', en: 'Suno / Udio: metallic ringing, top-end fizz, sibilance, drifting tone, export cutoff.' } },
  { id: 'master', ru: 'Мастеринг по референсу', en: 'Reference master', hint: { ru: 'Загрузите 1–5 треков-ориентиров: подгоню тональный баланс, ширину стерео и громкость.', en: 'Add 1–5 reference tracks: tonal balance, stereo width and loudness are matched.' } },
];

const TARGETS = [
  { v: 'auto', ru: 'авто', en: 'auto', hint: { ru: 'Музыка: не тише оригинала (в пределах −14…−8 LUFS). Речь: −16.', en: 'Music: not quieter than the original (within −14…−8 LUFS). Speech: −16.' } },
  { v: -14, ru: '−14 · стриминг', en: '−14 · streaming' },
  { v: -16, ru: '−16 · подкаст', en: '−16 · podcast' },
  { v: -19, ru: '−19 · тихо', en: '−19 · quiet' },
  { v: -23, ru: '−23 · ТВ', en: '−23 · TV' },
];

const FORMATS = [
  { v: 'source', ru: 'Как исходный', en: 'Same as source' },
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
  apollo: { ru: 'Нейро-реставрация', en: 'Neural restore' },
  match: { ru: 'Референс', en: 'Reference' },
  autotone: { ru: 'Автобаланс', en: 'Auto balance' },
  exciter: { ru: 'Гармоники верха', en: 'Top harmonics' },
  dyneq: { ru: 'Динам. EQ', en: 'Dynamic EQ' },
  drift: { ru: 'Дрейф тембра', en: 'Tone drift' },
  tone: { ru: 'Тон', en: 'Tone' },
  meq: { ru: 'EQ (ручной)', en: 'EQ (manual)' },
  stereo: { ru: 'Стерео', en: 'Stereo' },
  leveler: { ru: 'Лэвелер', en: 'Leveler' },
  compressor: { ru: 'Компрессор', en: 'Compressor' },
  loudness: { ru: 'LUFS', en: 'LUFS' },
  limiter: { ru: 'True peak', en: 'True peak' },
  encode: { ru: 'Экспорт', en: 'Export' },
};

const TEXT = {
  ru: {
    light: 'Лёгкая', medium: 'Средняя', heavy: 'Сильная',
    previewRun: 'Быстрый предпросмотр (12 с)', previewAgain: 'Обновить предпросмотр', previewing: 'Считаю фрагмент…', previewFrag: 'Фрагмент', previewHint: 'самый динамичный кусок трека, с вашими текущими настройками', previewStale: 'Настройки изменились — обновите предпросмотр', previewDone: 'Предпросмотр готов — послушайте До/После ниже',
    manualTitle: 'Ручные настройки', manualNote: 'Включите нужную группу — она заменит свой блок в цепочке, остальное останется от выбранного режима.',
    mode: 'Режим', target: 'Целевая громкость, LUFS', asRef: 'как у референса', ceiling: 'Потолок', format: 'Формат',
    intensity: 'Интенсивность', soft: 'мягко', strong: 'сильно',
    advanced: 'Тонкая настройка', auto: 'авто', on: 'вкл', off: 'выкл',
    opt: { denoise: 'Шумоподавление', dereverb: 'Удаление эха комнаты', declip: 'Восстановление клиппинга', declick: 'Удаление щелчков', apollo: 'Нейро-реставрация музыки (Apollo)', bwe: 'Восстановление верха без нейросети (SBR)', leveler: 'Лэвелер голоса', dehum: 'Подавление гула', autotone: 'Автобаланс тембра (музыка)', exciter: 'Гармоники верха — «воздух» (музыка)' },
    neural: 'Нейросеть для речи', dfn: 'DeepFilterNet3 · качество', rnn: 'RNNoise · лёгкая',
    apolloDevice: 'Нейро-реставрация считается на', devAuto: 'авто', devGpu: 'видеокарте', devCpu: 'процессоре',
    onGpu: 'на видеокарте', onCpu: 'на процессоре — это долго', left: 'осталось', skip: 'Пропустить (достроить верх через SBR)', min: 'мин', sec: 'с',
    monoBass: 'Моно-бас ниже 120 Гц', album: 'Единый профиль для всех файлов (альбом)',
    warmth: 'Тепло', presence: 'Разборчивость', air: 'Воздух',
    refs: 'Референсы', refsDrop: 'Перетащите 1–5 треков-ориентиров', refsHint: 'Готовые мастера в жанре, на которые хотите быть похожи',
    refsNeed: 'Для мастеринга по референсу загрузите хотя бы один трек-ориентир.',
    drop: 'Перетащите аудио сюда или нажмите', hint: 'WAV, MP3, FLAC, M4A, OGG — можно несколько файлов',
    analyzing: 'Анализ…', ready: 'Готов к обработке', process: 'Улучшить всё', processing: 'Обработка…',
    download: 'Скачать', downloadAll: 'Скачать всё', clear: 'Очистить', remove: 'Убрать',
    before: 'До', after: 'После', matchLevel: 'Сравнивать на равной громкости',
    diag: { byTag: 'по тегу', speech: 'речь', music: 'музыка', lufs: 'Громкость', tp: 'Пик', lra: 'Динамика', clip: 'Клиппинг', cut: 'Срез', noise: 'Шумовой пол', reverb: 'Эхо комнаты', hum: 'Гул', stereo: 'Стерео', mono: 'моно' },
    spectrum: 'Спектр: до и после (форма, выровнено по середине)',
    neuralLoading: 'Загружаю DeepFilterNet3 (~16 МБ, один раз — дальше из кеша)…',
    neuralReady: 'DeepFilterNet3 готов', neuralFailed: 'DeepFilterNet3 недоступен в этом браузере — использую RNNoise',
    chain: 'Цепочка', error: 'Не удалось обработать этот файл',
    play: 'Слушать', pause: 'Пауза', seek: 'Позиция в треке', abHint: 'Переключение мгновенное, в той же точке трека',
    changes: 'Что изменилось', explainHint: 'ⓘ Наведите или нажмите на показатель или шаг цепочки — расскажу, что он значит.',
    local: 'Всё считается в вашем браузере, файлы никуда не отправляются.',
    honest: 'Музыку после MP3/AAC восстанавливает нейросеть Apollo (модель ~38 МБ скачивается один раз). Есть видеокарта — считает на ней, нет — на процессоре: работает везде, но заметно дольше, и долгий счёт можно пропустить — тогда верх достроится SBR без нейросети.',
    apolloLoading: 'Загружаю нейросеть Apollo (~38 МБ, один раз — дальше из кеша)…', apolloFailed: 'Нейросеть Apollo не запустилась — верх восстановлен через SBR',
  },
  en: {
    light: 'Gentle', medium: 'Medium', heavy: 'Strong',
    previewRun: 'Quick preview (12 s)', previewAgain: 'Refresh preview', previewing: 'Processing the clip…', previewFrag: 'Clip', previewHint: 'the most dynamic part of the track, with your current settings', previewStale: 'Settings changed — refresh the preview', previewDone: 'Preview ready — compare Before/After below',
    manualTitle: 'Manual settings', manualNote: 'Switch a group on — it replaces its block in the chain, everything else stays as the chosen mode builds it.',
    mode: 'Mode', target: 'Target loudness, LUFS', asRef: 'match reference', ceiling: 'Ceiling', format: 'Format',
    intensity: 'Intensity', soft: 'gentle', strong: 'strong',
    advanced: 'Fine tuning', auto: 'auto', on: 'on', off: 'off',
    opt: { denoise: 'Noise reduction', dereverb: 'Room echo removal', declip: 'Clipping repair', declick: 'Click removal', apollo: 'Neural music restoration (Apollo)', bwe: 'High-end restoration without AI (SBR)', leveler: 'Voice leveler', dehum: 'Hum removal', autotone: 'Auto tonal balance (music)', exciter: 'Top-end harmonics — “air” (music)' },
    neural: 'Speech network', dfn: 'DeepFilterNet3 · quality', rnn: 'RNNoise · light',
    apolloDevice: 'Neural restoration runs on', devAuto: 'auto', devGpu: 'GPU', devCpu: 'CPU',
    onGpu: 'on the GPU', onCpu: 'on the CPU — this is slow', left: 'left', skip: 'Skip (rebuild the top end with SBR)', min: 'min', sec: 's',
    monoBass: 'Mono bass below 120 Hz', album: 'Shared profile for all files (album)',
    warmth: 'Warmth', presence: 'Presence', air: 'Air',
    refs: 'References', refsDrop: 'Drop 1–5 reference tracks', refsHint: 'Finished masters in the genre you want to sound like',
    refsNeed: 'Reference mastering needs at least one reference track.',
    drop: 'Drop audio here or click', hint: 'WAV, MP3, FLAC, M4A, OGG — several files are fine',
    analyzing: 'Analysing…', ready: 'Ready', process: 'Enhance all', processing: 'Processing…',
    download: 'Download', downloadAll: 'Download all', clear: 'Clear', remove: 'Remove',
    before: 'Before', after: 'After', matchLevel: 'Compare at equal loudness',
    diag: { byTag: 'by tag', speech: 'speech', music: 'music', lufs: 'Loudness', tp: 'Peak', lra: 'Range', clip: 'Clipping', cut: 'Cutoff', noise: 'Noise floor', reverb: 'Room echo', hum: 'Hum', stereo: 'Stereo', mono: 'mono' },
    spectrum: 'Spectrum: before and after (shape, aligned at mids)',
    neuralLoading: 'Loading DeepFilterNet3 (~16 MB, once — cached afterwards)…',
    neuralReady: 'DeepFilterNet3 ready', neuralFailed: 'DeepFilterNet3 is unavailable in this browser — using RNNoise',
    chain: 'Chain', error: 'Could not process this file',
    play: 'Play', pause: 'Pause', seek: 'Track position', abHint: 'Switches instantly, at the same point in the track',
    changes: 'What changed', explainHint: 'ⓘ Hover or tap a value or a chain step to see what it means.',
    local: 'Everything runs in your browser, files are never uploaded.',
    honest: 'Music damaged by MP3/AAC is restored by the Apollo neural net (~38 MB model, downloaded once). With a GPU it runs there, otherwise on the CPU: it works everywhere but is much slower, and a long run can be skipped — then the top end is rebuilt with SBR, without AI.',
    apolloLoading: 'Loading the Apollo neural net (~38 MB, once — cached afterwards)…', apolloFailed: 'Apollo could not start — the top end was rebuilt with SBR',
  },
};

const OPT_KEYS = ['denoise', 'dereverb', 'declip', 'declick', 'apollo', 'bwe', 'leveler', 'dehum', 'autotone', 'exciter'];

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
// Браузер запоминает неудачный динамический импорт до конца жизни воркера: одна
// случайная сетевая ошибка «отравляет» все повторы. Лечится новым воркером.
function restartEngine() {
  try { engine?.terminate(); } catch { /* уже остановлен */ }
  engine = null;
}
const IMPORT_FAIL = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

function call(msg, onProgress) {
  const id = `m${msgSeq += 1}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getEngine().postMessage({ ...msg, id });
  });
}

// Исходная частота из заголовка: decodeAudioData пересэмплирует в частоту
// контекста, поэтому декодируем в контексте ровно с частотой файла.
async function probeFile(file) {
  try {
    const mm = await import('music-metadata');
    const meta = await mm.parseBlob(file, { duration: false, skipCovers: true });
    const sr = meta.format.sampleRate;
    // генераторы пишут себя в теги («made with suno; created=…»): авто-режим выберет AI-цепочку
    const tags = JSON.stringify([meta.common.comment, meta.common.encodersettings, meta.common.software, meta.common.copyright, meta.common.albumartist, meta.common.label]);
    const ai = /suno/i.test(tags) ? 'Suno' : /\budio\b/i.test(tags) ? 'Udio' : null;
    return { sr: sr >= 8000 && sr <= 192000 ? sr : null, ai };
  } catch {
    return { sr: null, ai: null };
  }
}

async function decode(file) {
  const data = await file.arrayBuffer();
  const { sr, ai } = await probeFile(file);
  const ctx = sr ? new OfflineAudioContext(1, 1, sr) : getAudioCtx();
  const buf = await ctx.decodeAudioData(data.slice(0));
  const chans = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c += 1) chans.push(buf.getChannelData(c).slice());
  return { chans, sr: buf.sampleRate, aiTag: ai };
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
function fmtBytes(b) { return b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`; }

function Diagnostics({ a, t, language, onTip, aiTag }) {
  const chips = [];
  const push = (key, label, value, warn) => chips.push({ key, label, value, warn });
  if (aiTag) push('aitag', aiTag, t.diag.byTag);
  push('kind', a.content.kind === 'speech' ? t.diag.speech : t.diag.music, `${Math.round(a.content.confidence * 100)}%`);
  push('lufs', t.diag.lufs, `${fmt(a.lufs)} LUFS`);
  push('tp', t.diag.tp, `${fmt(a.truePeakDb)} dBTP`, a.truePeakDb > -1);
  push('lra', t.diag.lra, `${fmt(a.lra)} LU`);
  if (a.clipping.ratio > 0.00005) push('clip', t.diag.clip, `${fmt(a.clipping.ratio * 100, 2)}%`, a.clipping.ratio > 0.0003);
  if (a.bandLimited) push('cut', t.diag.cut, `${fmt(a.cutoffHz / 1000)} kHz`, true);
  // у непрерывной музыки без пауз шум не оценить — «пол» там просто тихие места
  const noiseKnown = a.content.kind === 'speech' || a.snrDb > 25;
  if (noiseKnown) push('noise', t.diag.noise, `${fmt(a.noiseFloorDb, 0)} dBFS`, a.noiseFloorDb > -60);
  if (a.rt60 != null) push('reverb', t.diag.reverb, `~${fmt(a.rt60, 2)} s`, a.rt60 > 0.5);
  if (a.hum) push('hum', t.diag.hum, `${a.hum.hz} Hz`, true);
  push('stereo', t.diag.stereo, a.channels > 1 ? `r = ${fmt(a.stereo.correlation, 2)}` : t.diag.mono);
  return (
    <div className="ae2-diag">
      {chips.map((c) => {
        const tipText = pick(diagHelp(c.key, a), language);
        const show = () => onTip(tipText);
        return (
          <button key={c.key} type="button" className={c.warn ? 'ae2-chip is-warn' : 'ae2-chip'} onMouseEnter={show} onFocus={show} onClick={show} aria-label={`${c.label} ${c.value}. ${tipText}`}>
            <b>{c.label}</b> {c.value}
          </button>
        );
      })}
    </div>
  );
}

function Chain({ steps, language, current, done, onTip }) {
  return (
    <ol className="ae2-chain">
      {steps.map((s, i) => {
        const state = done ? 'is-done' : current == null ? '' : i < current ? 'is-done' : i === current ? 'is-active' : '';
        const label = (STEP_LABEL[s.id] || { ru: s.id })[language] || STEP_LABEL[s.id]?.ru;
        const what = STEP_HELP[s.id] ? pick(STEP_HELP[s.id], language) : '';
        const did = done && s.ms != null ? changeText(s, language) : null;
        const tipText = did ? `${label}: ${what} → ${did}` : `${label}: ${what}`;
        const show = () => onTip(tipText);
        return <li key={`${s.id}-${i}`} className={`ae2-step ${state}`} tabIndex={0} onMouseEnter={show} onFocus={show} onClick={show}>{label}</li>;
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

// ---------- Состояние вне компонента ----------
// Файлы, анализ, результаты и настройки живут в модуле, а не в компоненте:
// уход на другой инструмент и возврат ничего не сбрасывает, а начатая обработка
// продолжается в фоне (воркер тоже модульный). Теряется только при перезагрузке
// вкладки — и об этом браузер спросит заранее (beforeunload).
const DEFAULT_MANUAL = {
  eq: { on: false, hp: 20, lp: 20000, bass: 0, warmth: 0, mid: 0, presence: 0, clarity: 0, air: 0 },
  comp: { on: false, threshold: -24, ratio: 3, attackMs: 10, releaseMs: 150, kneeDb: 6 },
  gate: { on: false, threshold: -55 },
  deess: { on: false, depthDb: 4 },
  noise: { on: false, amount: 0.5 },
  out: { on: false, gainDb: 0 },
};

// Группы ручных настроек: поля, диапазоны и пояснения (что значит и как выставлять).
const MANUAL_GROUPS = [
  { id: 'eq', ru: 'Фильтры и 6-полосный эквалайзер', en: 'Filters and 6-band EQ',
    hint: { ru: 'Фильтры убирают низ и верх, полосы подкрашивают тембр. Для голоса: верхний фильтр 80–100 Гц; для музыки оставьте 20 Гц.', en: 'Filters cut lows and highs, the bands shape tone. For voice: high-pass 80–100 Hz; for music leave it at 20 Hz.' },
    fields: [
      { k: 'hp', ru: 'Верхний фильтр (срез низа)', en: 'High-pass (cuts lows)', min: 20, max: 500, step: 5, unit: ' Гц', unitEn: ' Hz', tip: { ru: 'Убирает гул комнаты, ветер, вибрации ниже этой частоты.', en: 'Removes room rumble, wind and vibration below this frequency.' } },
      { k: 'lp', ru: 'Нижний фильтр (срез верха)', en: 'Low-pass (cuts highs)', min: 2000, max: 20000, step: 100, unit: ' Гц', unitEn: ' Hz', tip: { ru: 'Убирает шипение и резкость выше этой частоты. Для речи 12–14 кГц, для музыки 20 кГц.', en: 'Removes hiss and harshness above this frequency. 12–14 kHz for speech, 20 kHz for music.' } },
      { k: 'bass', ru: 'Бас, 100 Гц', en: 'Bass, 100 Hz', min: -12, max: 12, step: 0.5, unit: ' дБ', unitEn: ' dB', tip: { ru: 'Глубина и полнота. Поднимите у тонких записей, опустите при гулкости.', en: 'Depth and fullness. Raise for thin recordings, lower if boomy.' } },
      { k: 'warmth', ru: 'Теплота, 250 Гц', en: 'Warmth, 250 Hz', min: -12, max: 12, step: 0.5, unit: ' дБ', unitEn: ' dB', tip: { ru: 'Тело звука. Поднимите для холодных записей, опустите, если звук мутный или «бочковатый».', en: 'Body of the sound. Raise for cold recordings, lower if it is muddy or boxy.' } },
      { k: 'mid', ru: 'Середина, 1 кГц', en: 'Mids, 1 kHz', min: -12, max: 12, step: 0.5, unit: ' дБ', unitEn: ' dB', tip: { ru: 'Основной диапазон голоса. Поднимите, чтобы вывести вперёд.', en: 'The main voice range. Raise to bring it forward.' } },
      { k: 'presence', ru: 'Присутствие, 3 кГц', en: 'Presence, 3 kHz', min: -12, max: 12, step: 0.5, unit: ' дБ', unitEn: ' dB', tip: { ru: 'Разборчивость речи. Поднимите для чёткости, опустите, чтобы смягчить резкость.', en: 'Speech intelligibility. Raise for clarity, lower to soften harshness.' } },
      { k: 'clarity', ru: 'Чёткость, 5 кГц', en: 'Clarity, 5 kHz', min: -12, max: 12, step: 0.5, unit: ' дБ', unitEn: ' dB', tip: { ru: 'Детали согласных. Поднимите для тусклых записей, опустите при свисте.', en: 'Consonant detail. Raise for dull recordings, lower for whistly ones.' } },
      { k: 'air', ru: 'Воздух, 10 кГц', en: 'Air, 10 kHz', min: -12, max: 12, step: 0.5, unit: ' дБ', unitEn: ' dB', tip: { ru: 'Открытость и «искорка». Опустите, если запись слишком яркая или шумная.', en: 'Openness and sparkle. Lower if the recording is too bright or noisy.' } },
    ] },
  { id: 'comp', ru: 'Компрессор', en: 'Compressor',
    hint: { ru: 'Выравнивает громкость: тихое громче, громкое тише. 2–4:1 — мягко, 8–20:1 — сильно.', en: 'Evens out loudness: quiet louder, loud quieter. 2–4:1 is gentle, 8–20:1 is heavy.' },
    fields: [
      { k: 'threshold', ru: 'Порог', en: 'Threshold', min: -60, max: 0, step: 1, unit: ' дБ', unitEn: ' dB', tip: { ru: 'Уровень, выше которого включается сжатие. Чем ниже, тем больше сигнала сжимается.', en: 'The level above which compression starts. The lower, the more signal is compressed.' } },
      { k: 'ratio', ru: 'Степень', en: 'Ratio', min: 1, max: 20, step: 0.5, unit: ':1', unitEn: ':1', tip: { ru: 'Во сколько раз уменьшить превышение порога.', en: 'How many times to reduce the part above the threshold.' } },
      { k: 'attackMs', ru: 'Атака', en: 'Attack', min: 0.5, max: 100, step: 0.5, unit: ' мс', unitEn: ' ms', tip: { ru: 'Скорость реакции. Короткая (1–10 мс) ловит удары, длинная (20–100 мс) их пропускает.', en: 'Reaction speed. Short (1–10 ms) catches transients, long (20–100 ms) lets them through.' } },
      { k: 'releaseMs', ru: 'Восстановление', en: 'Release', min: 10, max: 1000, step: 10, unit: ' мс', unitEn: ' ms', tip: { ru: 'Как быстро компрессор отпускает. 50–100 мс для речи, 200–500 мс для музыки.', en: 'How fast the compressor lets go. 50–100 ms for speech, 200–500 ms for music.' } },
      { k: 'kneeDb', ru: 'Колено', en: 'Knee', min: 0, max: 40, step: 1, unit: ' дБ', unitEn: ' dB', tip: { ru: '0 — резкий переход, 20–40 — плавный, звучит естественнее.', en: '0 is an abrupt transition, 20–40 is smooth and sounds more natural.' } },
    ] },
  { id: 'gate', ru: 'Шумовой порог', en: 'Noise gate',
    hint: { ru: 'Прижимает звук в паузах. Подберите порог чуть выше уровня фонового шума.', en: 'Pushes down the sound in pauses. Set the threshold just above the background noise level.' },
    fields: [{ k: 'threshold', ru: 'Порог', en: 'Threshold', min: -90, max: -20, step: 1, unit: ' дБ', unitEn: ' dB', tip: { ru: 'Всё, что тише порога, считается паузой и приглушается.', en: 'Anything quieter than the threshold counts as a pause and is turned down.' } }] },
  { id: 'deess', ru: 'Де-эссер', en: 'De-esser',
    hint: { ru: 'Снижает свистящие «с», «ш», «ц» на 6.5 кГц, только когда они выпирают. Начните с 3–6 дБ.', en: 'Reduces sibilant “s”, “sh”, “ts” at 6.5 kHz, only when they stick out. Start with 3–6 dB.' },
    fields: [{ k: 'depthDb', ru: 'Глубина', en: 'Depth', min: 0, max: 12, step: 0.5, unit: ' дБ', unitEn: ' dB', tip: { ru: 'Максимальное подавление свистящих.', en: 'The maximum sibilance reduction.' } }] },
  { id: 'noise', ru: 'Шумоподавление', en: 'Noise reduction',
    hint: { ru: 'Сила нейросети (речь) или спектрального шумодава (музыка). Больше — чище, но риск «подводного» звука.', en: 'Strength of the neural net (speech) or the spectral denoiser (music). More is cleaner, but risks an underwater sound.' },
    fields: [{ k: 'amount', ru: 'Сила', en: 'Amount', min: 0, max: 1, step: 0.05, pct: true, tip: { ru: '0% — почти не трогать, 100% — максимум.', en: '0% barely touches it, 100% is the maximum.' } }] },
  { id: 'out', ru: 'Громкость на выходе', en: 'Output level',
    hint: { ru: 'Сдвигает итоговую громкость относительно цели в LUFS. Потолок пиков при этом сохраняется.', en: 'Shifts the final loudness relative to the LUFS target. The peak ceiling is kept.' },
    fields: [{ k: 'gainDb', ru: 'Сдвиг', en: 'Offset', min: -12, max: 12, step: 0.5, unit: ' дБ', unitEn: ' dB', tip: { ru: 'Плюс — громче, минус — тише. Не выше потолка пиков.', en: 'Plus is louder, minus is quieter. Never above the peak ceiling.' } }] },
];

const INITIAL = {
  items: [], refs: [], mode: 'auto', targetLufs: 'auto', ceilingDb: -1, format: 'source', intensity: 0.6,
  opts: Object.fromEntries(OPT_KEYS.map((k) => [k, 'auto'])), neuralEngine: 'dfn', apolloDevice: 'auto',
  tone: { warmth: 0, presence: 0, air: 0 }, monoBass: false, album: false, busy: false, neural: '',
  manual: DEFAULT_MANUAL, matchLevel: true, showAdv: false, player: { id: '', which: 'after', playing: false },
};
let store = INITIAL;
const subs = new Set();
const audioData = new Map(); // id → { chans, sr } — декодированный звук для обработки
function getStore() { return store; }
function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function setStore(patch) {
  store = { ...store, ...(typeof patch === 'function' ? patch(store) : patch) };
  subs.forEach((fn) => fn());
}
function patchItem(id, p) {
  setStore((s) => ({ items: s.items.map((it) => (it.id === id ? { ...it, ...(typeof p === 'function' ? p(it) : p) } : it)) }));
}
const planKeyOf = (s) => JSON.stringify([s.mode, s.targetLufs, s.ceilingDb, s.intensity, s.opts, s.neuralEngine, s.tone, s.monoBass, s.refs.length, s.manual]);
const hasWork = () => store.busy || store.items.length > 0 || store.refs.length > 0;

listeners.add((m) => {
  if (m.type !== 'neural') return;
  if (m.model === 'apollo') setStore({ apolloState: m.state, apolloOn: m.device || store.apolloOn }); else setStore({ neural: m.state });
});
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!hasWork()) return;
    e.preventDefault();
    e.returnValue = ''; // браузер покажет стандартное «Покинуть страницу? Изменения не сохранятся»
  });
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac|opus|aiff?)$/i.test(f.name));
  for (const file of files) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setStore((s) => ({ items: [...s.items, { id, name: file.name, size: file.size, status: 'analyzing', beforeUrl: URL.createObjectURL(file) }] }));
    try {
      // eslint-disable-next-line no-await-in-loop
      const { chans, sr, aiTag } = await decode(file);
      const probe = await probeAudio(file); // формат исходника: на нём строится «как исходный»
      if (!store.items.some((it) => it.id === id)) continue; // убрали, пока декодировали
      audioData.set(id, { chans, sr });
      // eslint-disable-next-line no-await-in-loop
      const { analysis } = await call({ type: 'analyze', chans, sr });
      patchItem(id, { status: 'ready', analysis, sr, aiTag, probe });
    } catch {
      patchItem(id, { status: 'error' });
    }
  }
}

async function addRefs(fileList) {
  const files = Array.from(fileList || []).slice(0, 5);
  for (const file of files) {
    const id = `r${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setStore((s) => ({ refs: [...s.refs, { id, name: file.name, status: 'analyzing' }].slice(0, 5) }));
    try {
      // eslint-disable-next-line no-await-in-loop
      const { chans, sr } = await decode(file);
      // eslint-disable-next-line no-await-in-loop
      const { profile } = await call({ type: 'profile', chans, sr });
      setStore((s) => ({ refs: s.refs.map((r) => (r.id === id ? { ...r, status: 'ready', profile } : r)) }));
    } catch {
      setStore((s) => ({ refs: s.refs.map((r) => (r.id === id ? { ...r, status: 'error' } : r)) }));
    }
  }
}

// Параметры движка из состояния + профили референсов/альбома.
async function buildEngineOpts(s0, { album }) {
  const readyRefs = s0.refs.filter((r) => r.profile).map((r) => r.profile);
  let reference = null;
  if (readyRefs.length && s0.mode === 'master') reference = (await call({ type: 'combine', profiles: readyRefs })).profile;
  let albumProfile = null;
  if (album && s0.album && !['voice', 'podcast', 'restore'].includes(s0.mode)) {
    const profs = [];
    for (const it of s0.items) {
      const d = audioData.get(it.id); if (!d) continue;
      // eslint-disable-next-line no-await-in-loop
      profs.push((await call({ type: 'profile', chans: d.chans, sr: d.sr })).profile);
    }
    if (profs.length > 1) albumProfile = (await call({ type: 'combine', profiles: profs })).profile;
  }
  return {
    targetLufs: s0.targetLufs, ceilingDb: s0.ceilingDb, intensity: s0.intensity, ...s0.opts, neural: s0.neuralEngine,
    tone: s0.tone, monoBass: s0.monoBass, apolloDevice: s0.apolloDevice, manual: s0.manual, reference, albumProfile,
  };
}

// Быстрый предпросмотр: тот же план на самом динамичном фрагменте ~12 с.
async function previewItem(id) {
  const s0 = store;
  const it = s0.items.find((x) => x.id === id); const d = audioData.get(id);
  if (!it || !d || it.status === 'analyzing' || it.status === 'processing' || it.previewing) return;
  if (s0.mode === 'master' && !s0.refs.some((r) => r.profile)) return;
  patchItem(id, { previewing: true, previewError: '', step: null, stepIndex: null, p: 0 });
  try {
    const engineOpts = await buildEngineOpts(s0, { album: false });
    const onProg = (m) => {
      if (m.step && m.i != null) patchItem(id, (prev) => (prev.step === m.step ? {} : { step: m.step, stepIndex: m.i, stepN: m.n, stepT0: Date.now() }));
      if (m.p != null) patchItem(id, { p: m.p });
    };
    const job = { type: 'preview', chans: d.chans, sr: d.sr, mode: s0.mode === 'auto' && it.aiTag ? 'ai' : s0.mode, opts: engineOpts, analysis: it.analysis, lang: s0.lang };
    let res = await call(job, onProg);
    if ((res.warnings || []).some((w) => IMPORT_FAIL.test(w))) { restartEngine(); res = await call(job, onProg); }
    forgetItemAudio(`${id}:p`);
    patchItem(id, {
      previewing: false,
      preview: {
        before: res.before, after: res.after, sr: res.sr, startSec: res.startSec, lenSec: res.lenSec, beforeLufs: res.beforeLufs,
        afterM: res.afterM, report: res.report, log: res.log, warnings: res.warnings || [], planKey: planKeyOf(s0),
      },
    });
  } catch (e) {
    patchItem(id, { previewing: false, previewError: e.message });
  }
}

async function processAll() {
  const s0 = store;
  const readyRefs = s0.refs.filter((r) => r.profile).map((r) => r.profile);
  if (s0.busy || (s0.mode === 'master' && !readyRefs.length)) return;
  setStore({ busy: true });
  try {
    const engineOpts = await buildEngineOpts(s0, { album: true });
    const planKey = planKeyOf(s0);
    for (const it of s0.items) {
      const d = audioData.get(it.id);
      if (!d || it.status === 'analyzing' || !store.items.some((x) => x.id === it.id)) continue;
      patchItem(it.id, { status: 'processing', step: null, stepIndex: null, p: 0, after: null, error: '', warnings: [], planKey });
      try {
        // eslint-disable-next-line no-await-in-loop
        const onProg = (m) => {
          if (m.step && m.i != null) patchItem(it.id, (prev) => (prev.step === m.step ? {} : { step: m.step, stepIndex: m.i, stepN: m.n, stepT0: Date.now() }));
          if (m.p != null) patchItem(it.id, { p: m.p });
        };
        const job = { type: 'process', chans: d.chans, sr: d.sr, mode: s0.mode === 'auto' && it.aiTag ? 'ai' : s0.mode, opts: engineOpts, format: s0.format === 'source' ? 'raw' : s0.format, analysis: it.analysis, lang: s0.lang };
        // eslint-disable-next-line no-await-in-loop
        let res = await call(job, onProg);
        // модуль не скачался (сеть моргнула) → свежий воркер и ещё одна попытка с нуля
        if ((res.warnings || []).some((w) => IMPORT_FAIL.test(w))) {
          restartEngine();
          patchItem(it.id, { step: null, stepIndex: null, p: 0 });
          // eslint-disable-next-line no-await-in-loop
          res = await call(job, onProg);
        }
        let blob; let ext = res.ext;
        if (res.chans) { // «как исходный»: воркер отдал сэмплы, кодируем в формат файла-источника
          const r = await encodeLike({ chans: res.chans, sr: res.sr }, { ...it.probe, size: it.size }, { target: 'source' }); // eslint-disable-line no-await-in-loop
          blob = r.blob; ext = r.ext;
        } else blob = new Blob([res.bytes], { type: res.mime });
        forgetItemAudio(it.id);
        patchItem(it.id, (prev) => {
          if (prev.outUrl) URL.revokeObjectURL(prev.outUrl);
          return {
            status: 'done', outUrl: URL.createObjectURL(blob), outSize: blob.size,
            outName: `${it.name.replace(/\.[^.]+$/, '')}-enhanced.${ext}`, after: res.after, report: res.report, log: res.log, kind: res.kind, warnings: res.warnings || [],
          };
        });
      } catch (e) {
        patchItem(it.id, { status: 'error', error: e.message });
      }
    }
  } finally {
    setStore({ busy: false });
  }
}

function revokeItem(it) {
  forgetItemAudio(it.id);
  forgetItemAudio(`${it.id}:p`);
  if (it.beforeUrl) URL.revokeObjectURL(it.beforeUrl);
  if (it.outUrl) URL.revokeObjectURL(it.outUrl);
  audioData.delete(it.id);
}
function removeItem(id) {
  const it = store.items.find((x) => x.id === id);
  if (it) revokeItem(it);
  setStore((s) => ({ items: s.items.filter((x) => x.id !== id) }));
}
function clearItems() {
  store.items.forEach(revokeItem);
  setStore({ items: [] });
}

function download(item) {
  const a = document.createElement('a');
  a.href = item.outUrl; a.download = item.outName;
  document.body.appendChild(a); a.click(); a.remove();
}

// Сеттер поля хранилища, совместимый с useState: значение или функция от прежнего.
const setter = (key) => (v) => setStore((s) => ({ [key]: typeof v === 'function' ? v(s[key]) : v }));
const setMode = (v) => setStore((s) => ({ mode: v, targetLufs: v !== 'master' && s.targetLufs === 'ref' ? 'auto' : s.targetLufs })); const setTargetLufs = setter('targetLufs'); const setCeilingDb = setter('ceilingDb');
const setFormat = setter('format'); const setIntensity = setter('intensity'); const setOpts = setter('opts');
const setManual = setter('manual'); const setNeuralEngine = setter('neuralEngine'); const setApolloDevice = setter('apolloDevice'); const setTone = setter('tone'); const setMonoBass = setter('monoBass');
const setAlbum = setter('album'); const setMatchLevel = setter('matchLevel'); const setShowAdv = setter('showAdv');
const setRefs = setter('refs');

// ---------- Подсказки: что значит показатель и что сделал шаг ----------
const L = (ru, en) => ({ ru, en });
const pick = (o, lang) => o[lang] || o.ru;

function diagHelp(key, a) {
  switch (key) {
    case 'aitag': return L('В тегах файла указано, что трек сгенерирован нейросетью (Suno/Udio). В режиме «Авто» включена цепочка «AI-музыка»: подавление «физа» и металлического звона, дрейф тембра.', 'The file tags say the track was generated by an AI service (Suno/Udio). In “Auto” mode the “AI music” chain is used: fizz and metallic ringing suppression, tone drift.');
    case 'kind': return a.content.kind === 'speech'
      ? L(`Запись похожа на речь (уверенность ${Math.round(a.content.confidence * 100)}%): слоговый ритм, паузы, почти нет баса. В авто-режиме пойдёт голосовая цепочка с нейро-шумодавом.`,
        `Looks like speech (${Math.round(a.content.confidence * 100)}% sure): syllable rhythm, pauses, little bass. Auto mode uses the voice chain with neural denoising.`)
      : L(`Запись похожа на музыку (уверенность ${Math.round(a.content.confidence * 100)}%): сплошной звук, бас, стерео. Речевая нейросеть не включится — она ест тарелки и пэды.`,
        `Looks like music (${Math.round(a.content.confidence * 100)}% sure): continuous sound, bass, stereo. The speech network stays off — it eats cymbals and pads.`);
    case 'lufs': return L(`Средняя громкость, как её слышит человек (LUFS по EBU R128). Стриминг выравнивает треки к −14, подкасты обычно −16, ТВ −23. Сейчас ${fmt(a.lufs)} LUFS${a.lufs < -20 ? ' — тихо, будет поднято.' : a.lufs > -12 ? ' — очень громко, возможна пережатость.' : '.'}`,
      `Average perceived loudness (LUFS, EBU R128). Streaming normalises to −14, podcasts −16, TV −23. Now ${fmt(a.lufs)} LUFS${a.lufs < -20 ? ' — quiet, will be raised.' : a.lufs > -12 ? ' — very loud, may be over-compressed.' : '.'}`);
    case 'tp': return L(`Настоящий пик с учётом точек между сэмплами (true peak). Выше −1 dBTP после сжатия в MP3/AAC появляются хрипы. Сейчас ${fmt(a.truePeakDb)} dBTP${a.truePeakDb > -1 ? ' — опасно, лимитер это исправит.' : ' — запас есть.'}`,
      `Real peak including points between samples (true peak). Above −1 dBTP, MP3/AAC encoding starts to distort. Now ${fmt(a.truePeakDb)} dBTP${a.truePeakDb > -1 ? ' — risky, the limiter will fix it.' : ' — safe headroom.'}`);
    case 'lra': return L(`Разброс громкости между тихими и громкими местами (LRA). Для речи комфортно 3–8 LU, у музыки 4–10. Сейчас ${fmt(a.lra)} LU${a.lra > 10 ? ' — сильные перепады, выровняю.' : '.'}`,
      `Loudness range between quiet and loud parts (LRA). Speech is comfortable at 3–8 LU, music 4–10. Now ${fmt(a.lra)} LU${a.lra > 10 ? ' — big swings, will be evened out.' : '.'}`);
    case 'clip': return L(`Доля срезанных пиков: звук упёрся в потолок и «сплющился» — слышно как треск/хрип. ${fmt(a.clipping.ratio * 100, 2)}% сэмплов. Пики будут восстановлены по форме волны (LSAR).`,
      `Share of clipped peaks: the waveform hit the ceiling and flattened — heard as crackle. ${fmt(a.clipping.ratio * 100, 2)}% of samples. Peaks are rebuilt from the waveform (LSAR).`);
    case 'cut': return L(`Выше ${fmt(a.cutoffHz / 1000)} кГц почти ничего нет — так режет MP3/AAC или экспорт нейросети. Звук теряет «воздух». В музыкальных режимах верх достраивается (SBR).`,
      `Almost nothing above ${fmt(a.cutoffHz / 1000)} kHz — typical MP3/AAC or AI-export cutoff. The sound loses “air”. Music modes rebuild the top end (SBR).`);
    case 'noise': return L(`Уровень фона в паузах: шум, гул, улица. Тише −60 dBFS — почти неслышно, громче −45 — заметно. Сейчас ${fmt(a.noiseFloorDb, 0)} dBFS.`,
      `Background level in pauses: hiss, hum, street. Below −60 dBFS is near-silent, above −45 is clearly audible. Now ${fmt(a.noiseFloorDb, 0)} dBFS.`);
    case 'reverb': return L(`Эхо комнаты: за сколько секунд хвост звука затухает на 60 дБ (RT60). До 0.3 с — сухо, 0.5–0.8 — «пустая комната», больше 1 — зал. Сейчас ~${fmt(a.rt60, 2)} с${a.rt60 > 0.5 ? ' — хвост будет приглушён.' : '.'}`,
      `Room echo: how many seconds the tail takes to decay by 60 dB (RT60). Under 0.3 s is dry, 0.5–0.8 an empty room, over 1 a hall. Now ~${fmt(a.rt60, 2)} s${a.rt60 > 0.5 ? ' — the tail will be reduced.' : '.'}`);
    case 'hum': return L(`Сетевой гул ${a.hum?.hz} Гц и его гармоники (от электросети, земли, кабеля). Будет вырезан узкими фильтрами — сам голос/музыку это не задевает.`,
      `Mains hum at ${a.hum?.hz} Hz and harmonics (power line, ground loop, cable). Removed with narrow notches — voice and music stay intact.`);
    case 'stereo': return a.channels > 1
      ? L(`Насколько каналы похожи (корреляция): 1 — почти моно, 0 — независимые, ниже 0 — проблемы с фазой, в моно звук провалится. Сейчас ${fmt(a.stereo.correlation, 2)}.`,
        `How similar the channels are (correlation): 1 is near-mono, 0 independent, below 0 phase problems — it collapses in mono. Now ${fmt(a.stereo.correlation, 2)}.`)
      : L('Моно-запись: один канал.', 'Mono recording: a single channel.');
    default: return L('', '');
  }
}

const STEP_HELP = {
  dc: L('Убирает постоянное смещение — оно съедает запас громкости и щёлкает на склейках.', 'Removes DC offset — it eats headroom and clicks at edits.'),
  hum: L('Узкие фильтры на частоте сети и гармониках вырезают гул.', 'Narrow notches at mains frequency and harmonics remove hum.'),
  declip: L('Восстанавливает срезанные пики по форме соседней волны (авторегрессия LSAR).', 'Rebuilds clipped peaks from the surrounding waveform (LSAR autoregression).'),
  declick: L('Находит короткие щелчки и треск и заполняет их по форме сигнала.', 'Finds short clicks and crackle and fills them from the signal shape.'),
  dereverb: L('Глушит поздний хвост эха комнаты, оставляя сам голос (по измеренному RT60).', 'Suppresses the late room-echo tail, keeping the voice (uses the measured RT60).'),
  denoise: L('Нейросеть DeepFilterNet3 отделяет голос от шума и фона.', 'DeepFilterNet3 network separates voice from noise and background.'),
  expander: L('Прижимает остаток шума в паузах между фразами.', 'Pushes down leftover noise in pauses between phrases.'),
  'spectral-denoise': L('Бережно убирает шипение по профилю шума, не трогая тон.', 'Gently removes hiss using a noise profile, leaving tonal content.'),
  resonance: L('Динамически прижимает узкие резонансы и «металлический» звон.', 'Dynamically tames narrow resonances and metallic ringing.'),
  apollo: L('Нейросеть Apollo восстанавливает середину и верх, съеденные MP3/AAC-сжатием. Работает на видеокарте (WebGPU).', 'The Apollo network restores mids and highs eaten by MP3/AAC compression. Runs on the GPU (WebGPU).'),
  bwe: L('Достраивает срезанный верх продолжением спектра (SBR) — возвращает «воздух».', 'Rebuilds the cut-off top end by extending the spectrum (SBR) — brings back “air”.'),
  match: L('Подгоняет тональный баланс под ваши референсы.', 'Matches tonal balance to your references.'),
  autotone: L('Сравнивает средний спектр трека с типичным для музыки и мягко подгоняет баланс низа, середины и верха (не больше ±3 дБ). Без референса — «как у мастеринг-ассистента».', 'Compares the track’s average spectrum with a typical music balance and gently nudges lows, mids and highs (never more than ±3 dB) — like a mastering assistant, without a reference.'),
  exciter: L('Добавляет тонкие гармоники выше 9 кГц на основе звучания 4,5–9 кГц: больше «воздуха» и блеска без подъёма шума. Включается, только если верх в треке настоящий.', 'Adds subtle harmonics above 9 kHz derived from the 4.5–9 kHz range: more air and sparkle without raising noise. Only runs when the track has a real top end.'),
  dyneq: L('Динамический EQ: прижимает бубнение, резкость и сибилянты только в моменты, когда они выпирают.', 'Dynamic EQ: tames boom, harshness and sibilance only when they stick out.'),
  drift: L('Выравнивает тембр по ходу трека, если он «плывёт».', 'Evens out tone that drifts over the track.'),
  tone: L('Лёгкая коррекция тембра: срез низа, разборчивость, воздух.', 'Gentle tone shaping: low cut, presence, air.'),
  meq: L('Ваши фильтры и 6-полосный эквалайзер вместо автоматической коррекции тембра.', 'Your filters and 6-band EQ instead of the automatic tone correction.'),
  stereo: L('Ширина стерео и моно-бас.', 'Stereo width and mono bass.'),
  leveler: L('Выравнивает громкость фраз: тихие поднимает, громкие опускает.', 'Evens out phrase loudness: lifts quiet, lowers loud.'),
  compressor: L('Уплотняет звук, уменьшая разницу между тихим и громким.', 'Adds density by narrowing the gap between quiet and loud.'),
  loudness: L('Доводит среднюю громкость до цели в LUFS.', 'Brings average loudness to the LUFS target.'),
  limiter: L('Не даёт пикам (включая межсэмпловые) выйти за потолок.', 'Keeps peaks (including inter-sample) under the ceiling.'),
};

// Что фактически сделал шаг — по цифрам из лога обработки.
function changeText(l, lang) {
  const r = (ru, en) => (lang === 'en' ? en : ru);
  switch (l.id) {
    case 'hum': return r(`Гул ${l.f0} Гц вырезан (${l.notches} фильтров).`, `${l.f0} Hz hum removed (${l.notches} notches).`);
    case 'declip': return l.repairedSamples ? r(`Восстановлено ${l.repairedSamples.toLocaleString('ru')} срезанных сэмплов.`, `${l.repairedSamples.toLocaleString('en')} clipped samples rebuilt.`) : r('Клиппинга не нашлось.', 'No clipping found.');
    case 'declick': return l.clicks ? r(`Убрано щелчков: ${l.clicks}.`, `Clicks removed: ${l.clicks}.`) : r('Щелчков не нашлось.', 'No clicks found.');
    case 'dereverb': return r(`Приглушён хвост эха (RT60 ≈ ${l.rt60} с).`, `Echo tail reduced (RT60 ≈ ${l.rt60} s).`);
    case 'denoise': return l.engine === 'dfn' ? r(`Шум убран нейросетью DeepFilterNet3 (до −${l.attenLimDb} дБ).`, `Noise removed by DeepFilterNet3 (up to −${l.attenLimDb} dB).`)
      : l.engine === 'rnnoise' ? r('Шум убран лёгкой нейросетью RNNoise.', 'Noise removed by the light RNNoise network.') : r('Шум убран спектральным методом.', 'Noise removed spectrally.');
    case 'expander': return r('Паузы между фразами стали чище.', 'Pauses between phrases are cleaner.');
    case 'spectral-denoise': return l.label === 'fizz' ? r(`Прижат «физ» выше ${l.fMin / 1000} кГц (до −${l.reductionDb} дБ).`, `Fizz above ${l.fMin / 1000} kHz reduced (up to −${l.reductionDb} dB).`) : r(`Шипение снижено до −${l.reductionDb} дБ.`, `Hiss reduced by up to ${l.reductionDb} dB.`);
    case 'resonance': return r('Прижаты резонансы и металлический звон.', 'Resonances and metallic ringing tamed.');
    case 'apollo': return l.engine === 'apollo'
      ? r(`Нейросеть Apollo восстановила звук после сжатия (срез был на ${(l.cutoffHz / 1000).toFixed(1)} кГц), ${l.device === 'wasm' ? 'на процессоре' : 'на видеокарте'}.`, `Apollo restored the codec-damaged audio (cutoff was at ${(l.cutoffHz / 1000).toFixed(1)} kHz), ${l.device === 'wasm' ? 'on the CPU' : 'on the GPU'}.`)
      : r(`Верх выше ${(l.cutoffHz / 1000).toFixed(1)} кГц достроен быстрым методом SBR (глубокая нейро-реставрация не использовалась — причина в предупреждении выше).`, `Top end above ${(l.cutoffHz / 1000).toFixed(1)} kHz rebuilt with the fast SBR method (deep neural restoration was not used — see the warning above).`);
    case 'bwe': return r(`Достроен верх выше ${(l.cutoffHz / 1000).toFixed(1)} кГц.`, `Top end rebuilt above ${(l.cutoffHz / 1000).toFixed(1)} kHz.`);
    case 'match': return r(`Баланс подогнан под референс (подъём до +${l.maxBoostDb} дБ, срез до ${l.maxCutDb} дБ).`, `Balance matched to reference (boost up to +${l.maxBoostDb} dB, cut down to ${l.maxCutDb} dB).`);
    case 'autotone': return (l.maxBoostDb > 0.3 || l.maxCutDb < -0.3)
      ? r(`Тональный баланс подправлен (подъём до +${l.maxBoostDb} дБ, срез до ${l.maxCutDb} дБ).`, `Tonal balance nudged (boost up to +${l.maxBoostDb} dB, cut down to ${l.maxCutDb} dB).`)
      : r('Баланс уже близок к типичному — правок не понадобилось.', 'Balance is already close to typical — no change needed.');
    case 'exciter': return l.addedDb > 0.1 ? r(`Добавлены гармоники верха (+${l.addedDb} дБ выше 12 кГц).`, `Top harmonics added (+${l.addedDb} dB above 12 kHz).`) : r('Верха для гармоник в треке нет — пропущено.', 'No top end to excite — skipped.');
    case 'dyneq': {
      const names = { mud: r('Бубнение', 'Mud'), boom: r('Гул низа', 'Boom'), harsh: r('Резкость', 'Harshness'), sibilance: r('Сибилянты', 'Sibilance') };
      const act = (l.bands || []).filter((b) => b.maxCutDb < -0.5);
      return act.length ? act.map((b) => r(`${names[b.id]}: до ${b.maxCutDb} дБ, ${b.activePct}% времени`, `${names[b.id]}: down to ${b.maxCutDb} dB, ${b.activePct}% of the time`)).join('; ') + '.' : r('Ничего не выпирало — EQ не вмешивался.', 'Nothing stuck out — EQ stayed idle.');
    }
    case 'meq': return r('Фильтры и эквалайзер применены по вашим настройкам.', 'Filters and EQ applied from your settings.');
    case 'drift': return (l.bands || []).length ? r(`Выровнен дрейф тембра (до ±${Math.max(...l.bands.map((b) => b.maxDb))} дБ).`, `Tone drift evened out (up to ±${Math.max(...l.bands.map((b) => b.maxDb))} dB).`) : r('Тембр стабильный — правок не понадобилось.', 'Tone is stable — no correction needed.');
    case 'stereo': return r(`Ширина стерео ×${l.width}${l.monoBassHz ? `, бас ниже ${l.monoBassHz} Гц в моно` : ''}.`, `Stereo width ×${l.width}${l.monoBassHz ? `, bass below ${l.monoBassHz} Hz in mono` : ''}.`);
    case 'leveler': return l?.maxDb ? r(`Громкость фраз выровнена (до ±${l.maxDb} дБ).`, `Phrase loudness evened out (up to ±${l.maxDb} dB).`) : null;
    case 'compressor': return r(`Сжатие пиков до ${l.maxGainReductionDb} дБ.`, `Peaks compressed by up to ${-l.maxGainReductionDb} dB.`);
    case 'loudness': return Number.isFinite(l.gainDb) ? r(`Громкость изменена на ${l.gainDb > 0 ? '+' : ''}${l.gainDb} дБ.`, `Loudness changed by ${l.gainDb > 0 ? '+' : ''}${l.gainDb} dB.`) : null;
    case 'limiter': return l.maxGainReductionDb > -0.2
      ? r('Лимитер не понадобился — пики и так ниже потолка.', 'No limiting needed — peaks were already under the ceiling.')
      : r(`Пики удержаны под потолком (сжатие до ${l.maxGainReductionDb} дБ).`, `Peaks held under the ceiling (up to ${-l.maxGainReductionDb} dB of limiting).`);
    default: return null;
  }
}

// ---------- A/B-плеер ----------
// «До» и «После» играют ОДНОВРЕМЕННО и синхронно (два AudioBufferSourceNode со
// стартом в одну и ту же точку времени), переключение — кроссфейд громкостей
// за 25 мс: без перезагрузки, паузы и сдвига позиции. Перемотка — перезапуск
// обоих источников с нового места.
const afterBuffers = new Map(); // id → AudioBuffer результата
const beforeBuffers = new Map(); // id → AudioBuffer исходника
const player = { id: '', which: 'after', playing: false, offset: 0, startedAt: 0, srcs: [], gains: null, duration: 0 };
const XFADE = 0.025;

function setPlayer(p) { Object.assign(player, p); setStore({ player: { id: player.id, which: player.which, playing: player.playing } }); }
function playerPos() {
  if (!player.playing) return player.offset;
  return Math.max(0, Math.min(player.duration, player.offset + (getAudioCtx().currentTime - player.startedAt)));
}

async function buffersFor(item) {
  const ctx = getAudioCtx();
  if (item.previewData) {
    const pd = item.previewData;
    if (!beforeBuffers.has(item.id)) {
      const mk = (chs) => { const b = ctx.createBuffer(chs.length, chs[0].length, pd.sr); chs.forEach((c, i) => b.copyToChannel(c, i)); return b; };
      beforeBuffers.set(item.id, mk(pd.before)); afterBuffers.set(item.id, mk(pd.after));
    }
    return [beforeBuffers.get(item.id), afterBuffers.get(item.id)];
  }
  if (!beforeBuffers.has(item.id)) {
    const d = audioData.get(item.id);
    const b = ctx.createBuffer(d.chans.length, d.chans[0].length, d.sr);
    d.chans.forEach((c, i) => b.copyToChannel(c, i));
    beforeBuffers.set(item.id, b);
  }
  if (!afterBuffers.has(item.id)) {
    const ab = await (await fetch(item.outUrl)).arrayBuffer();
    afterBuffers.set(item.id, await ctx.decodeAudioData(ab));
  }
  return [beforeBuffers.get(item.id), afterBuffers.get(item.id)];
}

// Громкость «до»/«после» на равной громкости: тише делаем более громкий вариант.
function levelGains(item) {
  if (!store.matchLevel || !item.after || !Number.isFinite(item.analysis?.lufs) || !Number.isFinite(item.after.lufs)) return [1, 1];
  const diff = item.after.lufs - item.analysis.lufs;
  return diff > 0 ? [1, 10 ** (-diff / 20)] : [10 ** (diff / 20), 1];
}

function stopSources() {
  player.srcs.forEach((s) => { try { s.onended = null; s.stop(); } catch { /* уже остановлен */ } s.disconnect(); });
  player.srcs = [];
}

async function playerStart(item, offset = player.id === item.id ? playerPos() : 0) {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') await ctx.resume();
  const cold = !afterBuffers.has(item.id) || !beforeBuffers.has(item.id);
  if (cold) setStore({ playerLoading: item.id });
  let bufs;
  try { bufs = await buffersFor(item); } finally { if (cold) setStore({ playerLoading: '' }); }
  stopSources();
  const which = player.id === item.id ? player.which : 'after';
  const lv = levelGains(item);
  const gains = bufs.map((_, i) => { const g = ctx.createGain(); g.gain.value = (i === 0) === (which === 'before') ? lv[i] : 0; g.connect(ctx.destination); return g; });
  const duration = Math.min(bufs[0].duration, bufs[1].duration);
  const off = Math.max(0, Math.min(offset, duration - 0.05));
  const t0 = ctx.currentTime + 0.03;
  const srcs = bufs.map((b, i) => { const s = ctx.createBufferSource(); s.buffer = b; s.connect(gains[i]); s.start(t0, off); return s; });
  srcs[1].onended = () => { if (player.srcs === srcs) { stopSources(); setPlayer({ playing: false, offset: 0 }); } };
  player.srcs = srcs; player.gains = gains; player.duration = duration;
  setPlayer({ id: item.id, which, playing: true, offset: off, startedAt: t0 });
}

function playerPause() {
  if (!player.playing) return;
  const pos = playerPos();
  stopSources();
  setPlayer({ playing: false, offset: pos });
}

function playerToggle(item) {
  if (player.id === item.id && player.playing) playerPause(); else playerStart(item);
}

function playerSwitch(item, which) {
  if (player.id !== item.id) { player.id = item.id; player.which = which; player.offset = 0; playerStart(item, 0); return; }
  if (player.playing && player.gains) {
    const ctx = getAudioCtx(); const lv = levelGains(item); const now = ctx.currentTime;
    player.gains.forEach((g, i) => {
      const target = (i === 0) === (which === 'before') ? lv[i] : 0;
      g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(target, now + XFADE);
    });
  }
  setPlayer({ which });
}

function playerSeek(item, t) {
  if (player.id === item.id && player.playing) playerStart(item, t);
  else setPlayer({ id: item.id, offset: t, playing: false });
}

function forgetItemAudio(id) {
  if (player.id === id) { stopSources(); setPlayer({ id: '', playing: false, offset: 0 }); }
  afterBuffers.delete(id); beforeBuffers.delete(id);
}

const fmtTime = (v) => { const s = Math.max(0, v || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };

function ABPlayer({ item, t }) {
  const st = useSyncExternalStore(subscribe, getStore);
  const mine = st.player?.id === item.id;
  const playing = mine && st.player.playing;
  const loading = st.playerLoading === item.id;
  const which = mine ? st.player.which : 'after';
  const duration = item.analysis?.duration || 0;
  const [pos, setPos] = useState(mine ? playerPos() : 0);
  const barRef = useRef(null);
  const dragging = useRef(false);
  useEffect(() => {
    if (!playing) { setPos(mine ? player.offset : 0); return undefined; }
    // таймер, а не rAF: rAF замирает в фоновой вкладке, а звук-то продолжает играть
    const id = setInterval(() => { if (!dragging.current) setPos(playerPos()); }, 100);
    return () => clearInterval(id);
  }, [playing, mine]);

  const timeAt = (clientX) => {
    const r = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  const onDown = (e) => {
    dragging.current = true; barRef.current.setPointerCapture(e.pointerId); setPos(timeAt(e.clientX));
  };
  const onMove = (e) => { if (dragging.current) setPos(timeAt(e.clientX)); };
  const onUp = (e) => {
    if (!dragging.current) return;
    dragging.current = false; const tt = timeAt(e.clientX); setPos(tt); playerSeek(item, tt);
  };
  const onKey = (e) => {
    const step = e.shiftKey ? 10 : 5;
    if (e.key === 'ArrowRight') { e.preventDefault(); playerSeek(item, Math.min(duration, pos + step)); setPos(Math.min(duration, pos + step)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); playerSeek(item, Math.max(0, pos - step)); setPos(Math.max(0, pos - step)); }
  };
  const pct = duration ? (pos / duration) * 100 : 0;
  return (
    <div className="ae2-player">
      <button type="button" className="ae2-play" onClick={() => playerToggle(item)} disabled={loading} aria-label={playing ? t.pause : t.play}>{loading ? '…' : playing ? '❚❚' : '▶'}</button>
      <div className="segmented ae2-ab-seg" role="group" aria-label="A/B">
        <button type="button" className={which === 'before' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => playerSwitch(item, 'before')} title={t.abHint}>{t.before}</button>
        <button type="button" className={which === 'after' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => playerSwitch(item, 'after')} title={t.abHint}>{t.after}</button>
      </div>
      <div
        ref={barRef} className="ae2-seek" role="slider" tabIndex={0} aria-label={t.seek}
        aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(pos)} aria-valuetext={fmtTime(pos)}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
      >
        <div className="ae2-seek-fill" style={{ width: `${pct}%` }} />
        <div className="ae2-seek-knob" style={{ left: `${pct}%` }} />
      </div>
      <span className="ae2-time">{fmtTime(pos)} / {fmtTime(duration)}</span>
    </div>
  );
}

// Честная сводка «что реально изменилось» при одинаковой громкости — чтобы не гадать на слух.
function bandName(f, en) { return f >= 1000 ? `${f / 1000} ${en ? 'kHz' : 'кГц'}` : `${f} ${en ? 'Hz' : 'Гц'}`; }
function DiffNote({ report, language }) {
  if (!report) return null;
  const en = language === 'en';
  const top = [...report.bands].sort((a, b) => Math.abs(b.db) - Math.abs(a.db))[0];
  const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  const tiny = report.maxBandDb < 1 && report.residualDb != null && report.residualDb < -30;
  const parts = [
    en ? `tone: up to ±${report.maxBandDb.toFixed(1)} dB${report.maxBandDb >= 0.5 && top ? ` (most at ${bandName(top.f, true)}: ${sign(top.db)} dB)` : ''}`
      : `тембр: до ±${report.maxBandDb.toFixed(1)} дБ${report.maxBandDb >= 0.5 && top ? ` (сильнее всего на ${bandName(top.f, false)}: ${sign(top.db)} дБ)` : ''}`,
    report.lufsDelta != null ? (en ? `loudness ${sign(report.lufsDelta)} LU` : `громкость ${sign(report.lufsDelta)} LU`) : null,
    report.residualDb != null ? (en ? `signal difference ${report.residualDb} dB` : `разница сигналов ${report.residualDb} дБ`) : null,
  ].filter(Boolean);
  return (
    <p className="ae2-diff">
      <b>{en ? 'What really changed (at equal loudness):' : 'Что реально изменилось (при равной громкости):'}</b> {parts.join(' · ')}.
      {tiny && <span> {en ? 'The difference is tiny: this track is already in good shape, so there was little to fix. Loudness is usually what makes “enhanced” sound better — try the Intensity slider or the manual EQ for a stronger result.' : 'Разница очень мала: трек уже в хорошем состоянии, чинить почти нечего. «Улучшение» на слух часто сводится к громкости — для заметного эффекта подвигайте «Интенсивность» или ручной EQ.'}</span>}
    </p>
  );
}

function ManualPanel({ manual, setManual, t, language }) {
  const en = language === 'en';
  const upd = (g, k, v) => setManual((m) => ({ ...m, [g]: { ...m[g], [k]: v } }));
  return (
    <div className="ae2-man">
      <h3 className="ae2-man-title">{t.manualTitle}</h3>
      <p className="ae2-man-note">{t.manualNote}</p>
      {MANUAL_GROUPS.map((g) => {
        const grp = manual[g.id];
        return (
          <fieldset key={g.id} className={grp.on ? 'ae2-man-group is-on' : 'ae2-man-group'}>
            <legend>
              <label className="tool-check">
                <input type="checkbox" checked={grp.on} onChange={(e) => upd(g.id, 'on', e.target.checked)} /> {en ? g.en : g.ru}
              </label>
            </legend>
            <p className="ae2-man-hint">{pick(g.hint, language)}</p>
            <div className="ae2-man-fields">
              {g.fields.map((f) => {
                const val = grp[f.k];
                const shown = f.pct ? `${Math.round(val * 100)}%` : `${val > 0 && f.min < 0 ? '+' : ''}${val}${en ? f.unitEn : f.unit}`;
                return (
                  <label key={f.k} className="ae2-man-field" title={pick(f.tip, language)}>
                    <span>{en ? f.en : f.ru}: <b>{shown}</b></span>
                    <input type="range" min={f.min} max={f.max} step={f.step} value={val} disabled={!grp.on} onChange={(e) => upd(g.id, f.k, Number(e.target.value))} aria-label={en ? f.en : f.ru} />
                    <small>{pick(f.tip, language)}</small>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function ApolloStatus({ item, t, device }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  const n = item.stepN || 1;
  const stepP = Math.max(0, Math.min(1, (item.p || 0) * n - (item.stepIndex || 0)));
  const elapsed = (Date.now() - (item.stepT0 || Date.now())) / 1000;
  const eta = stepP > 0.02 ? (elapsed * (1 - stepP)) / stepP : null;
  const fmtEta = (sec) => (sec >= 90 ? `~${Math.round(sec / 60)} ${t.min}` : `~${Math.max(1, Math.round(sec))} ${t.sec}`);
  return (
    <div className="ae2-apollo-status">
      <span>Apollo {device === 'wasm' ? t.onCpu : t.onGpu}{eta != null ? ` · ${t.left} ${fmtEta(eta)}` : ''}</span>
      <button type="button" className="ae-ab-btn" onClick={() => getEngine().postMessage({ type: 'skip-apollo' })}>{t.skip}</button>
    </div>
  );
}

function AudioEnhancer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const refInputRef = useRef(null);
  const st = useSyncExternalStore(subscribe, getStore);
  const { apolloDevice } = st;
  const {
    items, refs, mode, targetLufs, ceilingDb, format, intensity, opts, neuralEngine, tone, monoBass, album,
    busy, neural, matchLevel, showAdv,
  } = st;
  const [tip, setTip] = useState({ id: '', text: '' });
  useEffect(() => { if (store.lang !== language) setStore({ lang: language }); }, [language]);
  const showTip = (id, text) => setTip({ id, text });

  // Предпросмотр цепочки — тот же роутер, что в воркере, но без тяжёлых данных.
  const [previews, setPreviews] = useState({});
  const previewKey = planKeyOf(st);
  useEffect(() => {
    let cancelled = false;
    import('../../audio-engine/pipeline.js').then(({ plan }) => {
      if (cancelled) return;
      const next = {};
      for (const it of items) {
        if (!it.analysis) continue;
        // предпросмотр знает ширину и динамику референсов — шаги совпадают с реальной обработкой
        const ready = refs.filter((r) => r.profile).map((r) => r.profile);
        const avg = (k) => { const v = ready.map((p) => p[k]).filter(Number.isFinite); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : undefined; };
        const fakeRef = mode === 'master' && ready.length ? { sideToMid: avg('sideToMid'), lra: avg('lra'), plr: avg('plr'), lufs: avg('lufs'), db: [] } : null;
        next[it.id] = plan(it.analysis, mode === 'auto' && it.aiTag ? 'ai' : mode, { targetLufs, ceilingDb, intensity, ...opts, neural: neuralEngine, tone, monoBass, manual: st.manual, reference: fakeRef });
      }
      setPreviews(next);
    });
    return () => { cancelled = true; };
  }, [items, previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const modeInfo = MODES.find((m) => m.id === mode);
  const readyCount = items.filter((it) => it.status === 'ready' || it.status === 'done').length;
  const doneCount = items.filter((it) => it.status === 'done').length;
  const needRefs = mode === 'master' && !refs.some((r) => r.profile);
  const speechMode = mode === 'voice' || mode === 'podcast' || mode === 'restore';

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
            {TARGETS.map((x) => <button key={x.v} type="button" className={targetLufs === x.v ? 'segmented-btn is-active' : 'segmented-btn'} title={x.hint ? (x.hint[language] || x.hint.ru) : undefined} onClick={() => setTargetLufs(x.v)}>{x[language] || x.ru}</button>)}
            {mode === 'master' && <button type="button" className={targetLufs === 'ref' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTargetLufs('ref')}>{t.asRef}</button>}
          </div>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.ceiling}</span>
          <div className="segmented">
            {[-1, -1.5, -2].map((v) => <button key={v} type="button" className={ceilingDb === v ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setCeilingDb(v)}>{`${String(v).replace('-', '−')} dBTP`}</button>)}
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
          <div className="segmented ae2-strength">
            {[[0.3, t.light], [0.6, t.medium], [0.9, t.heavy]].map(([v, label]) => (
              <button key={v} type="button" className={Math.abs(intensity - v) < 0.06 ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setIntensity(v)}>{label}</button>
            ))}
          </div>
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
            <div className="tool-field">
              <span className="tool-field-label">{t.apolloDevice}</span>
              <div className="segmented">
                {[['auto', t.devAuto], ['gpu', t.devGpu], ['cpu', t.devCpu]].map(([v, label]) => (
                  <button key={v} type="button" className={apolloDevice === v ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setApolloDevice(v)}>{label}</button>
                ))}
              </div>
            </div>
            {['warmth', 'presence', 'air'].map((k) => (
              <div key={k} className="tool-field">
                <span className="tool-field-label">{t[k]}: {tone[k] > 0 ? '+' : ''}{tone[k]} dB</span>
                <input type="range" min="-6" max="6" step="0.5" value={tone[k]} onChange={(e) => setTone((o) => ({ ...o, [k]: Number(e.target.value) }))} />
              </div>
            ))}
          </div>
          <ManualPanel manual={st.manual} setManual={setManual} t={t} language={language} />
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
          <button type="button" className="tool-btn ghost" onClick={clearItems} disabled={busy}>{t.clear}</button>
          {doneCount > 0 && <label className="tool-check"><input type="checkbox" checked={matchLevel} onChange={(e) => setMatchLevel(e.target.checked)} /> {t.matchLevel}</label>}
        </div>
      )}
      {needRefs && items.length > 0 && <p className="ae2-warn">{t.refsNeed}</p>}
      {neural === 'loading' && busy && <p className="ae2-neural">⏳ {t.neuralLoading}</p>}
      {neural === 'failed' && <p className="ae2-neural is-warn">⚠ {t.neuralFailed}</p>}
      {st.apolloState === 'loading' && busy && <p className="ae2-neural">⏳ {t.apolloLoading}</p>}
      {st.apolloState === 'failed' && <p className="ae2-neural is-warn">⚠ {t.apolloFailed}</p>}

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
                {it.status === 'done' && <button type="button" className="tool-btn small" onClick={() => download(it)}>{t.download}</button>}
                {!busy && it.status !== 'processing' && <button type="button" className="ae-ab-btn ae2-remove" onClick={() => removeItem(it.id)} aria-label={t.remove}>✕</button>}
              </div>
              {it.status === 'analyzing' && <p className="ae2-status">{t.analyzing}</p>}
              {it.warnings?.length > 0 && <p className="ae2-warn">⚠ {it.warnings.join(' · ')}</p>}
              {it.status === 'error' && <p className="ae2-warn">⚠ {t.error}{it.error ? `: ${it.error}` : ''}</p>}
              {it.analysis && <Diagnostics a={it.analysis} aiTag={it.aiTag} t={t} language={language} onTip={(text) => showTip(it.id, text)} />}
              {it.analysis && <p className="ae2-explain" aria-live="polite">{tip.id === it.id && tip.text ? tip.text : t.explainHint}</p>}
              {steps.length > 0 && (
                <div className="ae2-chain-wrap">
                  <span className="ae2-chain-label">{t.chain}</span>
                  <Chain steps={steps} language={language} current={it.status === 'processing' ? it.stepIndex : null} done={it.status === 'done' && fresh} onTip={(text) => showTip(it.id, text)} />
                </div>
              )}
              {(it.status === 'ready' || it.status === 'done') && (
                <div className="ae2-preview">
                  <button type="button" className="tool-btn small" disabled={it.previewing || busy} onClick={() => previewItem(it.id)}>
                    {it.previewing ? t.previewing : it.preview ? t.previewAgain : t.previewRun}
                  </button>
                  <span className="ae2-preview-note">
                    {it.previewing
                      ? (it.step && STEP_LABEL[it.step] ? (STEP_LABEL[it.step][language] || STEP_LABEL[it.step].ru) : '')
                      : it.preview
                        ? `${t.previewFrag} ${fmtTime(it.preview.startSec)}–${fmtTime(it.preview.startSec + it.preview.lenSec)}${it.preview.planKey !== previewKey ? ` · ${t.previewStale}` : ''}`
                        : t.previewHint}
                  </span>
                  {it.previewError && <p className="ae2-warn">⚠ {it.previewError}</p>}
                  {it.preview?.warnings?.length > 0 && <p className="ae2-warn">⚠ {it.preview.warnings.join(' · ')}</p>}
                </div>
              )}
              {it.preview && it.status !== 'done' && it.status !== 'processing' && (
                <ABPlayer
                  item={{ id: `${it.id}:p`, previewData: it.preview, analysis: { duration: it.preview.lenSec, lufs: it.preview.beforeLufs }, after: { lufs: it.preview.afterM.lufs } }}
                  t={t}
                />
              )}
              {it.preview && it.status !== 'done' && it.status !== 'processing' && <DiffNote report={it.preview.report} language={language} />}
              {it.status === 'processing' && (
                <div className="bgr-progress ae2-progress">
                  <span>{t.processing} {it.step && STEP_LABEL[it.step] ? `· ${STEP_LABEL[it.step][language] || STEP_LABEL[it.step].ru}` : ''}</span>
                  <div className="bgr-bar"><div className="bgr-bar-fill" style={{ width: `${Math.round((it.p || 0) * 100)}%` }} /></div>
                  {it.step === 'apollo' && <ApolloStatus item={it} t={t} device={st.apolloOn} />}
                </div>
              )}
              {it.status === 'done' && it.after && (
                <p className="ae2-result">
                  {fmt(it.analysis.lufs)} → <b>{fmt(it.after.lufs)} LUFS</b> · {fmt(it.analysis.truePeakDb)} → <b>{fmt(it.after.truePeakDb)} dBTP</b> · LRA {fmt(it.analysis.lra)} → <b>{fmt(it.after.lra)} LU</b>
                  {it.log?.find((l) => l.id === 'denoise') ? ` · ${it.log.find((l) => l.id === 'denoise').engine === 'dfn' ? 'DeepFilterNet3' : it.log.find((l) => l.id === 'denoise').engine === 'rnnoise' ? 'RNNoise' : 'spectral'}` : ''}
                </p>
              )}
              {it.status === 'done' && it.after && <ABPlayer item={it} t={t} />}
              {it.status === 'done' && it.after && <DiffNote report={it.report} language={language} />}
              {it.status === 'done' && it.log && (
                <details className="ae2-changes" open>
                  <summary>{t.changes}</summary>
                  <ul>
                    {it.log.map((l, i) => {
                      const text = changeText(l, language);
                      const secs = l.ms >= 1000 ? ` (${l.ms >= 60000 ? `${(l.ms / 60000).toFixed(1)} ${t.min}` : `${Math.round(l.ms / 1000)} ${t.sec}`})` : '';
                      return text ? <li key={`${l.id}-${i}`}><b>{(STEP_LABEL[l.id] || { ru: l.id })[language] || STEP_LABEL[l.id]?.ru}.</b> {text}<span className="ae2-ms">{secs}</span></li> : null;
                    })}
                  </ul>
                </details>
              )}
              {it.analysis && (it.status === 'done' || it.status === 'ready') && (
                <Spectrum before={it.analysis.spectrum} after={it.after?.spectrum} sr={it.sr} t={t} />
              )}
            </li>
          );
        })}
      </ul>

      <input ref={inputRef} type="file" accept="audio/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.local}</p>
      <p className="tool-local-note">ℹ️ {t.honest}</p>
    </div>
  );
}

export default AudioEnhancer;
