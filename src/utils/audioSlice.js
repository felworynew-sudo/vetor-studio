// Логика нарезки аудио без DOM — чтобы тестировать в Node.
//  • detectSilenceCuts — паузы по порогу и длине, рез в самой тихой точке паузы
//    (как в openvpi/audio-slicer), с минимальной длиной куска;
//  • equalCuts / everyCuts — равные части и «каждые N секунд»;
//  • parseTracklist — «00:00 Интро» и метки Audacity («начало<TAB>конец<TAB>название»);
//  • snapToZero — рез на ближайшем переходе через ноль, чтобы не щёлкало.

const HOP = 0.01; // 10 мс

const dbCache = new WeakMap(); // по первому каналу: ползунки порога не пересчитывают громкость кадров

export function frameDb(chans, sr, hop = HOP) {
  const hit = dbCache.get(chans[0]);
  if (hit && hit.sr === sr && hit.hop === hop) return hit.res;
  const res = frameDbRaw(chans, sr, hop);
  dbCache.set(chans[0], { sr, hop, res });
  return res;
}

function frameDbRaw(chans, sr, hop) {
  const size = Math.max(1, Math.round(sr * hop));
  const n = Math.floor(chans[0].length / size);
  const db = new Float32Array(n);
  for (let f = 0; f < n; f += 1) {
    let s = 0;
    for (const d of chans) for (let i = f * size; i < (f + 1) * size; i += 1) s += d[i] * d[i];
    db[f] = 10 * Math.log10(s / (size * chans.length) + 1e-12);
  }
  return { db, hop: size / sr };
}

// Паузы: участки тише порога длиннее minPause. Возвращает [{ from, to }] в секундах.
export function findSilences(chans, sr, { thrDb = -40, minPause = 0.5 } = {}) {
  const { db, hop } = frameDb(chans, sr);
  const out = []; let start = -1;
  for (let f = 0; f <= db.length; f += 1) {
    const quiet = f < db.length && db[f] < thrDb;
    if (quiet && start < 0) start = f;
    if (!quiet && start >= 0) {
      if ((f - start) * hop >= minPause) out.push({ from: start * hop, to: f * hop, mid: quietestPoint(db, start, f, hop) });
      start = -1;
    }
  }
  return out;
}

// Самое тихое место паузы: середина самой длинной серии кадров у минимума (при равенстве —
// ближе к центру паузы). Для ровной цифровой тишины это просто середина паузы.
function quietestPoint(db, a, b, hop) {
  let min = Infinity; for (let f = a; f < b; f += 1) if (db[f] < min) min = db[f];
  const centre = (a + b) / 2; let best = (a + b) / 2; let bestLen = 0; let bestD = Infinity;
  for (let f = a; f < b;) {
    if (db[f] > min + 0.5) { f += 1; continue; } // eslint-disable-line no-continue
    let e = f; while (e < b && db[e] <= min + 0.5) e += 1;
    const mid = (f + e) / 2; const d = Math.abs(mid - centre);
    if (e - f > bestLen || (e - f === bestLen && d < bestD)) { best = mid; bestLen = e - f; bestD = d; }
    f = e;
  }
  return best * hop;
}

// Из пауз — точки реза. Кусок короче minPiece не создаётся: такой рез просто пропускается.
export function cutsFromSilences(silences, duration, minPiece = 1) {
  const cuts = []; let last = 0;
  for (const s of silences) {
    if (s.mid - last >= minPiece && duration - s.mid >= minPiece) { cuts.push(s.mid); last = s.mid; }
  }
  return cuts;
}

export function detectSilenceCuts(chans, sr, { thrDb = -40, minPause = 0.5, minPiece = 1 } = {}) {
  return cutsFromSilences(findSilences(chans, sr, { thrDb, minPause }), chans[0].length / sr, minPiece);
}

// «Авто» порог: шумовой пол (5-й процентиль громкости кадров) + 8 дБ.
export function suggestThreshold(chans, sr) {
  const { db } = frameDb(chans, sr);
  const v = Array.from(db, (x) => Math.max(x, -90)).sort((p, q) => p - q); // цифровая тишина = −90, а не «нет данных»
  if (!v.length) return -40;
  return Math.round(Math.max(-65, Math.min(-20, v[Math.floor(v.length * 0.05)] + 8)));
}

export function equalCuts(duration, parts) {
  const n = Math.max(1, Math.floor(parts));
  return Array.from({ length: n - 1 }, (_, i) => ((i + 1) * duration) / n);
}

export function everyCuts(duration, every, minPiece = 0.2) {
  const cuts = [];
  if (!(every > 0)) return cuts;
  for (let t = every; t < duration - minPiece; t += every) cuts.push(t);
  return cuts;
}

const TIME = String.raw`(?:\d{1,2}:)?\d{1,3}:\d{2}(?:[.,]\d+)?`;
function toSec(s) {
  const p = s.replace(',', '.').split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}

// Список таймкодов → [{ t, name }]. Понимает: «03:21 Название», «[03:21] Название», «1. 03:21 — Название»,
// «Название 03:21», метки Audacity «12.5<TAB>12.5<TAB>Название». Строки без времени игнорируются.
export function parseTracklist(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const aud = line.match(/^(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)(?:\s+(.*))?$/);
    if (aud) { out.push({ t: Number(aud[1].replace(',', '.')), name: (aud[3] || '').trim() }); continue; }
    const lead = line.match(new RegExp(String.raw`^(?:\d+[.)]\s*)?[\[(]?(${TIME})[\])]?\s*[-–—:|.]*\s*(.*)$`));
    if (lead) { out.push({ t: toSec(lead[1]), name: lead[2].trim() }); continue; }
    const trail = line.match(new RegExp(String.raw`^(.*?)\s*[-–—:|]*\s*[\[(]?(${TIME})[\])]?$`));
    if (trail) out.push({ t: toSec(trail[2]), name: trail[1].trim() });
  }
  return out.filter((x) => Number.isFinite(x.t) && x.t >= 0).sort((a, b) => a.t - b.t);
}

export function fmtStamp(sec, decimals = 0) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  const rs = decimals ? r.toFixed(decimals).padStart(3 + decimals, '0') : String(Math.floor(r)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rs}` : `${m}:${rs.padStart(2, '0')}`;
}

// Ближайший к t переход через ноль (по сумме каналов) в пределах ±maxMs. Нет такого — t как есть.
export function snapToZero(chans, sr, t, maxMs = 8) {
  const n = chans[0].length; const c = Math.round(t * sr); const r = Math.round((maxMs / 1000) * sr);
  const at = (i) => { let s = 0; for (const d of chans) s += d[i] || 0; return s; };
  let best = -1;
  for (let d = 0; d <= r; d += 1) {
    for (const i of d === 0 ? [c] : [c - d, c + d]) {
      if (i < 1 || i >= n - 1) continue; // eslint-disable-line no-continue
      const a = at(i - 1); const b = at(i);
      if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) { best = i; break; }
    }
    if (best >= 0) break;
  }
  return best >= 0 ? best / sr : t;
}

// Кусок буфера как «псевдо-AudioBuffer» (хватает encodeWAV/encodeMp3) с фейдами по краям.
export function sliceBuffer(buf, fromSec, toSec2, fadeMs = 0) {
  const sr = buf.sampleRate;
  const a = Math.max(0, Math.round(fromSec * sr)); const b = Math.min(buf.length, Math.round(toSec2 * sr));
  const len = Math.max(1, b - a);
  const fade = Math.min(Math.round((fadeMs / 1000) * sr), Math.floor(len / 2));
  const data = [];
  for (let c = 0; c < buf.numberOfChannels; c += 1) {
    const out = buf.getChannelData(c).slice(a, a + len);
    for (let i = 0; i < fade; i += 1) { const g = i / fade; out[i] *= g; out[len - 1 - i] *= g; }
    data.push(out);
  }
  return { numberOfChannels: data.length, sampleRate: sr, length: len, duration: len / sr, getChannelData: (c) => data[c] };
}

// Имя файла: «NN - название» если название задано, иначе «файл-NN»; запрещённые символы убираем.
export function partFileName(base, index, total, name, ext) {
  const num = String(index + 1).padStart(Math.max(2, String(total).length), '0');
  const clean = (s) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const n = clean(name || '');
  return `${n ? `${num} - ${n}` : `${clean(base) || 'audio'}-${num}`}.${ext}`;
}
