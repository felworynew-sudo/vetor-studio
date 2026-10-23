// Модель эквалайзера без DOM: полосы, пресеты, расчёт АЧХ, авто-компенсация громкости.
// Те же формулы (RBJ Cookbook), что у BiquadFilterNode в браузере, поэтому кривая на экране,
// звук в реальном времени и экспорт совпадают.

import { biquad, biquadMag } from '../audio-engine/dsp.js';

export const BAND_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const GAIN_MAX = 18;
export const BUTTER4_Q = [0.5412, 1.3066];
export const BAND_TYPES = ['peaking', 'lowshelf', 'highshelf', 'notch'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function defaultBands() {
  return BAND_FREQS.map((f) => ({ type: 'peaking', f, q: 1.3, gain: 0, on: true }));
}

export function defaultModel() {
  return { bands: defaultBands(), hp: { on: false, f: 40 }, lp: { on: false, f: 18000 }, pre: 0, autoPre: true };
}

// Пресеты: усиление по 10 полосам (32…16k), опционально HP/LP (Гц) и предусиление.
const P = (id, ru, en, group, gains, extra = {}) => ({ id, ru, en, group, gains, ...extra });
export const PRESETS = [
  P('flat', 'Ровная (без изменений)', 'Flat', 'basic', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  P('bass-boost', 'Больше баса', 'Bass boost', 'basic', [6, 6, 4, 1.5, 0, 0, 0, 0, 0, 0]),
  P('bass-cut', 'Меньше баса / гула', 'Less bass / boom', 'basic', [-6, -5, -3, -1, 0, 0, 0, 0, 0, 0]),
  P('treble-boost', 'Больше верха', 'Treble boost', 'basic', [0, 0, 0, 0, 0, 0.5, 2, 4, 6, 6]),
  P('loudness', 'Громкостный «смайл»', 'Loudness (smile)', 'basic', [5, 4.5, 2.5, 0, -1.5, -1, 0.5, 2.5, 4, 4.5]),
  P('vocal', 'Вокал выше', 'Vocal presence', 'basic', [-3, -2, -1, 0, 1, 2.5, 4, 3, 1, 0]),
  P('warm', 'Тёплый звук', 'Warm', 'basic', [2, 3, 3, 2, 1, 0, -1, -2, -3, -4]),
  P('bright', 'Яркий / «воздух»', 'Bright / air', 'basic', [-1, -1, 0, 0, 0, 1, 2, 3, 4, 5]),
  P('clarity', 'Чистота (убрать муть)', 'Clarity (de-mud)', 'basic', [0, 0, -2, -4, -2, 0, 1.5, 2.5, 2.5, 1]),
  P('soft', 'Мягче (убрать резкость)', 'Softer (tame harshness)', 'basic', [0, 0, 0, 0, 0, -1, -3, -4, -2.5, -1]),
  P('podcast', 'Подкаст / голос', 'Podcast voice', 'voice', [-6, -4, -2, -2, 0, 2, 3, 2, 0, -2], { hp: 70, lp: 16000 }),
  P('speech-clear', 'Разборчивая речь', 'Clear speech', 'voice', [-9, -6, -3, -2, 0, 2, 4, 3, 0, -3], { hp: 100, lp: 12000 }),
  P('telephone', 'Телефон', 'Telephone', 'voice', [-18, -18, -12, -4, 2, 5, 3, -4, -12, -18], { hp: 350, lp: 3400 }),
  P('rock', 'Рок', 'Rock', 'genre', [5, 4, 2, -1, -3, -2, 1, 3, 4, 5]),
  P('pop', 'Поп', 'Pop', 'genre', [-1, 1, 3, 3.5, 2, 0, -0.5, -1, -1, -2]),
  P('classical', 'Классика', 'Classical', 'genre', [1, 1, 0, 0, 0, 0, -1, -2, -2.5, -3]),
  P('jazz', 'Джаз', 'Jazz', 'genre', [3, 2.5, 1, 2, -2, -2, 0, 1.5, 2.5, 3]),
  P('electronic', 'Электроника / клуб', 'Electronic / club', 'genre', [6, 5, 1, 0, -2, 2, 1, 1.5, 5, 6]),
  P('hiphop', 'Хип-хоп', 'Hip-hop', 'genre', [6, 5.5, 3, 1, -1, -1, 1, 0.5, 1.5, 2]),
  P('acoustic', 'Акустика', 'Acoustic', 'genre', [3, 3, 2, 1, 1, 1, 2, 3, 3, 2]),
  P('laptop', 'Для ноутбука / маленьких колонок', 'Laptop / small speakers', 'device', [-3, 2, 5, 4, 2, 0, 0, 0, 0, 0], { hp: 60 }),
  P('headphones', 'Наушники: смягчить верх', 'Headphones: soften the top', 'device', [1, 1, 0, 0, 0, 0, -1, -2, -2, -1]),
  P('rumble', 'Убрать гул и инфразвук', 'Remove rumble', 'device', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { hp: 40 }),
];
export const PRESET_GROUPS = [['basic', 'Основные', 'Essentials'], ['voice', 'Голос', 'Voice'], ['genre', 'Жанры', 'Genres'], ['device', 'Под устройство', 'For your device']];

export function presetModel(id, base) {
  const p = PRESETS.find((x) => x.id === id); if (!p) return null;
  const m = defaultModel();
  m.bands.forEach((b, i) => { b.gain = p.gains[i] || 0; });
  m.hp = { on: !!p.hp, f: p.hp || 40 }; m.lp = { on: !!p.lp, f: p.lp || 18000 };
  m.pre = p.pre || 0; m.autoPre = base ? base.autoPre : true;
  return m;
}

// Обезвреженная модель из JSON (пресет из файла/хранилища): границы и типы приводим к допустимым.
export function sanitizeModel(raw) {
  const m = defaultModel();
  if (!raw || typeof raw !== 'object') return m;
  const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? clamp(Number(v), lo, hi) : d);
  if (Array.isArray(raw.bands)) {
    m.bands = m.bands.map((d, i) => {
      const r = raw.bands[i]; if (!r || typeof r !== 'object') return d;
      return { type: BAND_TYPES.includes(r.type) ? r.type : d.type, f: num(r.f, 20, 20000, d.f), q: num(r.q, 0.1, 18, d.q), gain: num(r.gain, -GAIN_MAX, GAIN_MAX, 0), on: r.on !== false };
    });
  }
  if (raw.hp) m.hp = { on: !!raw.hp.on, f: num(raw.hp.f, 20, 500, 40) };
  if (raw.lp) m.lp = { on: !!raw.lp.on, f: num(raw.lp.f, 2000, 20000, 18000) };
  m.pre = num(raw.pre, -24, 24, 0); m.autoPre = raw.autoPre !== false;
  return m;
}

// Список биквадов цепочки: полосы + HP/LP по 24 дБ/окт (два биквада Баттерворта).
export function cascade(model) {
  const out = [];
  if (model.hp.on) BUTTER4_Q.forEach((q) => out.push({ type: 'highpass', f: model.hp.f, q, gain: 0 }));
  if (model.lp.on) BUTTER4_Q.forEach((q) => out.push({ type: 'lowpass', f: model.lp.f, q, gain: 0 }));
  for (const b of model.bands) {
    if (!b.on) continue; // eslint-disable-line no-continue
    if (b.type !== 'notch' && Math.abs(b.gain) < 0.01) continue; // eslint-disable-line no-continue
    out.push({ type: b.type, f: b.f, q: b.q, gain: b.gain });
  }
  return out;
}

export function logFreqs(n = 240, lo = 20, hi = 20000) {
  return Float64Array.from({ length: n }, (_, i) => lo * (hi / lo) ** (i / (n - 1)));
}

// АЧХ в дБ без предусиления; shelves/peaking/HP/LP — как у BiquadFilterNode.
export function responseDb(model, freqs, sr = 48000) {
  const cs = cascade(model).map((s) => biquad(s.type, s.f, sr, { q: s.q, gainDb: s.gain }));
  return Float64Array.from(freqs, (f) => {
    let db = 0;
    for (const c of cs) db += 20 * Math.log10(biquadMag(c, f, sr) + 1e-12);
    return db;
  });
}

// Авто-предусиление: минус максимум положительного подъёма (как «Auto preamp» в Equalizer APO).
export function autoPreampDb(model, sr = 48000) {
  const r = responseDb(model, logFreqs(200), sr);
  let peak = 0; for (const v of r) if (v > peak) peak = v;
  return -Math.min(24, Math.round(peak * 10) / 10);
}

export function totalPreDb(model, sr) {
  return (model.autoPre ? autoPreampDb(model, sr) : 0) + model.pre;
}

export function isFlat(model) {
  return !model.hp.on && !model.lp.on && model.bands.every((b) => !b.on || (b.type !== 'notch' && Math.abs(b.gain) < 0.01));
}

export const bandLabel = (f) => (f >= 1000 ? `${+(f / 1000).toFixed(f % 1000 ? 1 : 0)}k` : String(Math.round(f)));
