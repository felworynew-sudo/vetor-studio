// Базовые DSP-примитивы движка: БПФ, биквады (RBJ), STFT, ресемплер, 4×
// оверсэмплинг для true peak. Без DOM и Web Audio — работает в воркере и в Node.

export const dbToLin = (db) => 10 ** (db / 20);
export const linToDb = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------- БПФ (radix-2, комплексное, на месте) ----------
const fftCache = new Map();
function fftTables(n) {
  let t = fftCache.get(n);
  if (t) return t;
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i += 1) {
    let r = 0; let x = i;
    for (let b = 0; b < bits; b += 1) { r = (r << 1) | (x & 1); x >>= 1; }
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2); const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i += 1) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  t = { rev, cos, sin };
  fftCache.set(n, t);
  return t;
}

export function fft(re, im, inverse = false) {
  const n = re.length;
  const { rev, cos, sin } = fftTables(n);
  for (let i = 0; i < n; i += 1) {
    const j = rev[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  const sgn = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1; const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k += 1) {
        const wr = cos[k * step]; const wi = sgn * sin[k * step];
        const a = start + k; const b = a + half;
        const xr = re[b] * wr - im[b] * wi; const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
  if (inverse) { for (let i = 0; i < n; i += 1) { re[i] /= n; im[i] /= n; } }
}

export function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i += 1) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

// ---------- Биквады (RBJ Audio EQ Cookbook) ----------
export function biquad(type, f, sr, { q = 0.7071, gainDb = 0 } = {}) {
  const w0 = (2 * Math.PI * clamp(f, 1, sr * 0.499)) / sr;
  const cw = Math.cos(w0); const sw = Math.sin(w0);
  const A = 10 ** (gainDb / 40);
  const alpha = sw / (2 * q);
  let b0; let b1; let b2; let a0; let a1; let a2;
  switch (type) {
    case 'lowpass': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'highpass': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break; // 0 дБ на центре
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peaking': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: throw new Error(`unknown biquad ${type}`);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

// Применить биквад к массиву; out может совпадать с x (на месте).
export function filter(x, c, out = new Float32Array(x.length)) {
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  const { b0, b1, b2, a1, a2 } = c;
  for (let i = 0; i < x.length; i += 1) {
    const v = x[i];
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}

export function filterChain(x, coeffs, out) {
  let cur = x;
  for (let i = 0; i < coeffs.length; i += 1) { cur = filter(cur, coeffs[i], i === 0 ? (out || new Float32Array(x.length)) : cur); }
  return cur === x ? Float32Array.from(x) : cur;
}

// АЧХ биквада на частоте f (линейно) — для тестов и графиков.
export function biquadMag(c, f, sr) {
  const w = (2 * Math.PI * f) / sr;
  const cr = Math.cos(w); const ci = -Math.sin(w); const c2r = Math.cos(2 * w); const c2i = -Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cr + c.b2 * c2r; const ni = c.b1 * ci + c.b2 * c2i;
  const dr = 1 + c.a1 * cr + c.a2 * c2r; const di = c.a1 * ci + c.a2 * c2i;
  return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
}

// ---------- Огибающие ----------
export function coef(sec, sr) { return sec <= 0 ? 0 : Math.exp(-1 / (sec * sr)); }

// Скользящий RMS по кадрам: возвращает RMS на кадр размера frame.
export function frameRms(x, frame) {
  const n = Math.floor(x.length / frame);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f += 1) {
    let s = 0; const o = f * frame;
    for (let i = 0; i < frame; i += 1) s += x[o + i] * x[o + i];
    out[f] = Math.sqrt(s / frame);
  }
  return out;
}

export function percentile(arr, p) {
  if (!arr.length) return NaN;
  const a = Float64Array.from(arr).sort();
  return a[clamp(Math.floor((a.length - 1) * p), 0, a.length - 1)];
}

export function mixMono(chans) {
  if (chans.length === 1) return chans[0];
  const n = chans[0].length; const m = new Float32Array(n); const k = 1 / chans.length;
  for (let c = 0; c < chans.length; c += 1) { const d = chans[c]; for (let i = 0; i < n; i += 1) m[i] += d[i] * k; }
  return m;
}

// Линейная интерполяция покадровых значений в посэмпловые.
export function framesToSamples(vals, hop, offset, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const pos = (i - offset) / hop;
    const k = Math.floor(pos);
    if (k < 0) out[i] = vals[0];
    else if (k >= vals.length - 1) out[i] = vals[vals.length - 1];
    else { const t = pos - k; out[i] = vals[k] * (1 - t) + vals[k + 1] * t; }
  }
  return out;
}

// ---------- Ресемплер (окно Кайзера, sinc, произвольное отношение) ----------
function besselI0(x) {
  let s = 1; let t = 1;
  for (let k = 1; k < 30; k += 1) { t *= (x / (2 * k)) ** 2; s += t; }
  return s;
}

export function resample(x, from, to) {
  if (from === to) return Float32Array.from(x);
  const ratio = to / from;
  const outLen = Math.round(x.length * ratio);
  const out = new Float32Array(outLen);
  const half = 24; const beta = 8.6; const i0b = besselI0(beta);
  const cutoff = Math.min(1, ratio) * 0.95; // полоса относительно исходной Найквиста
  const phases = 512;
  const table = new Float32Array((2 * half + 1) * (phases + 1));
  for (let p = 0; p <= phases; p += 1) {
    const frac = p / phases;
    for (let k = -half; k <= half; k += 1) {
      const t = k - frac;
      const s = t === 0 ? 1 : Math.sin(Math.PI * cutoff * t) / (Math.PI * cutoff * t);
      const r = t / (half + 1);
      const w = Math.abs(r) >= 1 ? 0 : besselI0(beta * Math.sqrt(1 - r * r)) / i0b;
      table[p * (2 * half + 1) + (k + half)] = s * w * cutoff;
    }
  }
  for (let j = 0; j < outLen; j += 1) {
    const pos = j / ratio;
    const ip = Math.floor(pos);
    const frac = pos - ip;
    const p = Math.round(frac * phases);
    const base = p * (2 * half + 1);
    let acc = 0;
    for (let k = -half; k <= half; k += 1) {
      const idx = ip + k;
      if (idx >= 0 && idx < x.length) acc += x[idx] * table[base + k + half];
    }
    out[j] = acc;
  }
  return out;
}

// ---------- 4× оверсэмплинг (полифазный FIR) для true peak ----------
const OS = 4; const OS_HALF = 8; // тапов с каждой стороны
let osTable = null;
// Коэффициенты интерполяции в дробной точке i + p/OS: c[k] при x[i + k],
// k = −OS_HALF+1 … OS_HALF (windowed sinc, окно Кайзера).
function osFilter() {
  if (osTable) return osTable;
  const beta = 6; const i0b = besselI0(beta);
  osTable = [];
  for (let p = 0; p < OS; p += 1) {
    const tau = p / OS;
    const c = new Float64Array(2 * OS_HALF);
    let s = 0;
    for (let j = 0; j < 2 * OS_HALF; j += 1) {
      const k = j - OS_HALF + 1;
      const t = tau - k;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const r = t / OS_HALF;
      c[j] = Math.abs(r) >= 1 ? 0 : sinc * (besselI0(beta * Math.sqrt(1 - r * r)) / i0b);
      s += c[j];
    }
    for (let j = 0; j < c.length; j += 1) c[j] /= s;
    osTable.push(c);
  }
  return osTable;
}

// Для каждого сэмпла — максимум |x| среди точек восстановленного (4×) сигнала
// по обе стороны от него. Возвращает Float32Array пиков.
// Сумма модулей коэффициентов — верхняя граница «перелёта» интерполяции над
// локальным максимумом |x|: блоки, заведомо тише порога, можно не считать.
let osGain = 0;
function osBound() {
  if (!osGain) for (const c of osFilter()) { let s = 0; for (let j = 0; j < c.length; j += 1) s += Math.abs(c[j]); osGain = Math.max(osGain, s); }
  return osGain;
}

// threshold: точки, где пик заведомо ниже порога, получают просто |x|.
export function truePeakEnvelope(x, threshold = 0) {
  const ph = osFilter(); const S = osBound();
  const n = x.length; const out = new Float32Array(n);
  const B = 64;
  for (let b0 = 0; b0 < n; b0 += B) {
    const b1 = Math.min(n, b0 + B);
    let lm = 0;
    for (let i = Math.max(0, b0 - OS_HALF); i < Math.min(n, b1 + OS_HALF); i += 1) { const a = Math.abs(x[i]); if (a > lm) lm = a; }
    if (lm * S <= threshold) {
      for (let i = b0; i < b1; i += 1) { const a = Math.abs(x[i]); if (a > out[i]) out[i] = a; }
      continue;
    }
    for (let i = b0; i < b1; i += 1) {
      let m = Math.abs(x[i]);
      for (let p = 1; p < OS; p += 1) {
        const c = ph[p]; let acc = 0;
        for (let j = 0; j < c.length; j += 1) {
          const idx = i + j - OS_HALF + 1;
          if (idx >= 0 && idx < n) acc += x[idx] * c[j];
        }
        const a = Math.abs(acc);
        if (a > m) m = a;
      }
      if (m > out[i]) out[i] = m;
      if (i + 1 < n && m > out[i + 1]) out[i + 1] = m;
    }
  }
  return out;
}

export function truePeakDb(chans) {
  // порог = текущий sample peak: интерполяция может быть только выше него
  let sp = 0;
  for (const c of chans) for (let i = 0; i < c.length; i += 1) { const a = Math.abs(c[i]); if (a > sp) sp = a; }
  let m = sp;
  for (const c of chans) { const e = truePeakEnvelope(c, m); for (let i = 0; i < e.length; i += 1) if (e[i] > m) m = e[i]; }
  return linToDb(m);
}

export function samplePeakDb(chans) {
  let m = 0;
  for (const c of chans) for (let i = 0; i < c.length; i += 1) { const a = Math.abs(c[i]); if (a > m) m = a; }
  return linToDb(m);
}

// ---------- STFT / ISTFT (Hann, перекрытие 75%, точная реконструкция) ----------
// process(re, im, frameIndex) — меняет спектр кадра на месте (бины 0..N/2, симметрию
// восстанавливаем сами).
export function stftProcess(x, N, hop, process, onFrame) {
  const win = hann(N);
  const n = x.length;
  const frames = Math.ceil((n + N) / hop);
  const out = new Float64Array(n + 2 * N);
  const norm = new Float64Array(n + 2 * N);
  const re = new Float64Array(N); const im = new Float64Array(N);
  for (let f = 0; f < frames; f += 1) {
    const start = f * hop - N; // с отступом слева, чтобы края обрабатывались полноценно
    for (let i = 0; i < N; i += 1) { const idx = start + i; re[i] = (idx >= 0 && idx < n ? x[idx] : 0) * win[i]; im[i] = 0; }
    fft(re, im);
    process(re, im, f);
    for (let k = 1; k < N / 2; k += 1) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    im[0] = 0; im[N / 2] = 0;
    fft(re, im, true);
    for (let i = 0; i < N; i += 1) {
      const idx = start + i + N;
      out[idx] += re[i] * win[i]; norm[idx] += win[i] * win[i];
    }
    if (onFrame && f % 256 === 0) onFrame(f / frames);
  }
  const y = new Float32Array(n);
  for (let i = 0; i < n; i += 1) { const w = norm[i + N]; y[i] = w > 1e-9 ? out[i + N] / w : 0; }
  return y;
}

// Средний спектр мощности (Велч) в дБ, бины 0..N/2.
export function averageSpectrum(x, N = 4096, maxFrames = 1500, weights = null) {
  const win = hann(N); const re = new Float64Array(N); const im = new Float64Array(N);
  const acc = new Float64Array(N / 2 + 1);
  const total = Math.max(1, Math.floor((x.length - N) / (N / 2)));
  const stride = Math.max(1, Math.floor(total / maxFrames));
  let wsum = 0;
  for (let f = 0; f < total; f += stride) {
    const o = f * (N / 2);
    for (let i = 0; i < N; i += 1) { re[i] = (x[o + i] || 0) * win[i]; im[i] = 0; }
    const w = weights ? weights(o, N) : 1;
    if (w <= 0) continue;
    fft(re, im);
    for (let k = 0; k <= N / 2; k += 1) acc[k] += (re[k] * re[k] + im[k] * im[k]) * w;
    wsum += w;
  }
  const out = new Float64Array(N / 2 + 1);
  for (let k = 0; k <= N / 2; k += 1) out[k] = 10 * Math.log10(acc[k] / (wsum || 1) + 1e-20);
  return out;
}

// Сглаживание спектра в дБ по долям октавы.
export function smoothOctave(db, sr, N, fraction = 3) {
  const bins = db.length; const out = new Float64Array(bins);
  const binHz = sr / N;
  const pre = new Float64Array(bins + 1);
  const lin = db.map((v) => 10 ** (v / 10));
  for (let k = 0; k < bins; k += 1) pre[k + 1] = pre[k] + lin[k];
  const r = 2 ** (1 / (2 * fraction));
  for (let k = 0; k < bins; k += 1) {
    const f = Math.max(binHz, k * binHz);
    const lo = clamp(Math.floor(f / r / binHz), 0, bins - 1);
    const hi = clamp(Math.ceil((f * r) / binHz), lo + 1, bins);
    out[k] = 10 * Math.log10((pre[hi] - pre[lo]) / (hi - lo) + 1e-20);
  }
  return out;
}

export const yieldThread = () => new Promise((r) => setTimeout(r, 0));
