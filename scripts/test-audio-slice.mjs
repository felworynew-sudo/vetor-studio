// Проверка логики нарезки аудио на синтетике с известным ответом.
// Запуск: node scripts/test-audio-slice.mjs
import {
  detectSilenceCuts, equalCuts, everyCuts, findSilences, fmtStamp, parseTracklist, partFileName, sliceBuffer, snapToZero, suggestThreshold,
} from '../src/utils/audioSlice.js';

const SR = 8000;
let fails = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 4 «трека» по 5 с с паузами по 1 с: 0–5 звук, 5–6 тишина, 6–11 звук, 11–12 тишина, 12–17, 17–18, 18–23
function tracks({ noiseFloor = 0 } = {}) {
  const total = 23; const x = new Float32Array(total * SR);
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  for (let i = 0; i < x.length; i += 1) {
    const t = i / SR; const inGap = (t >= 5 && t < 6) || (t >= 11 && t < 12) || (t >= 17 && t < 18);
    x[i] = (inGap ? 0 : 0.4 * Math.sin(2 * Math.PI * 220 * t)) + noiseFloor * rnd();
  }
  return { x, total };
}

{
  const { x } = tracks();
  const cuts = detectSilenceCuts([x], SR, { thrDb: -40, minPause: 0.5, minPiece: 1 });
  check('Тишина: три паузы → три реза в их серединах', cuts.length === 3 && near(cuts[0], 5.5, 0.1) && near(cuts[1], 11.5, 0.1) && near(cuts[2], 17.5, 0.1), cuts.map((c) => c.toFixed(2)).join(', '));
  const long = detectSilenceCuts([x], SR, { thrDb: -40, minPause: 1.5, minPiece: 1 });
  check('Тишина: пауза короче минимальной не режет', long.length === 0, `${long.length} резов`);
  const big = detectSilenceCuts([x], SR, { thrDb: -40, minPause: 0.5, minPiece: 6 });
  check('Тишина: кусок не короче minPiece (рез пропускается)', big.every((c, i, a) => c - (a[i - 1] || 0) >= 6) && big.length < 3, big.map((c) => c.toFixed(1)).join(', '));
  const sil = findSilences([x], SR, { thrDb: -40, minPause: 0.5 });
  check('Паузы для подсветки: границы известны', sil.length === 3 && near(sil[0].from, 5, 0.03) && near(sil[0].to, 6, 0.03), `${sil[0].from.toFixed(2)}–${sil[0].to.toFixed(2)}`);
}
{
  // шум в паузах −30 дБ: порог −40 не видит пауз, −25 видит
  const { x } = tracks({ noiseFloor: 0.06 });
  const strict = detectSilenceCuts([x], SR, { thrDb: -40, minPause: 0.5, minPiece: 1 });
  const loose = detectSilenceCuts([x], SR, { thrDb: -25, minPause: 0.5, minPiece: 1 });
  check('Порог: шумные паузы видны только при мягком пороге', strict.length === 0 && loose.length === 3, `${strict.length} / ${loose.length}`);
}
{
  // рез в самой тихой точке паузы, а не посередине: «тихая яма» смещена к 5.8 с
  const { x } = tracks({ noiseFloor: 0.02 });
  for (let i = Math.round(5.75 * SR); i < Math.round(5.85 * SR); i += 1) x[i] = 0;
  const cuts = detectSilenceCuts([x], SR, { thrDb: -30, minPause: 0.5, minPiece: 1 });
  check('Рез в самой тихой точке паузы', cuts.length >= 1 && near(cuts[0], 5.8, 0.03), cuts[0] && cuts[0].toFixed(2));
}
{
  const eq = equalCuts(100, 4);
  check('Равные части: 4 части → 3 реза', eq.length === 3 && near(eq[0], 25, 1e-9) && near(eq[2], 75, 1e-9), eq.join(', '));
  check('Равные части: 1 часть → без резов', equalCuts(100, 1).length === 0, '');
  const ev = everyCuts(100, 30);
  check('Каждые N секунд: 30/60/90, хвост 10 с остаётся куском', ev.length === 3 && ev[2] === 90, ev.join(', '));
  check('Каждые N секунд: крошечный хвост не создаёт кусок', everyCuts(60.05, 30).length === 1, '');
  check('Каждые N секунд: нулевой шаг безопасен', everyCuts(100, 0).length === 0, '');
}
{
  const { x } = tracks();
  const dig = suggestThreshold([x], SR);
  const { x: noisy } = tracks({ noiseFloor: 0.06 });
  const nz = suggestThreshold([noisy], SR);
  const cutsDig = detectSilenceCuts([x], SR, { thrDb: dig, minPause: 0.5, minPiece: 1 }).length;
  const cutsNz = detectSilenceCuts([noisy], SR, { thrDb: nz, minPause: 0.5, minPiece: 1 }).length;
  check('Авто-порог: цифровая тишина и шумные паузы дают три реза', cutsDig === 3 && cutsNz === 3, `пороги ${dig} / ${nz} дБ, резов ${cutsDig} / ${cutsNz}`);
}
{
  const list = parseTracklist('0:00 Интро\n03:21 — Первая песня\n[1:02:03.5] Финал\nмусорная строка\n1. 04:00 | Со списком\nВторая 05:10\n');
  const got = list.map((x) => `${x.t}:${x.name}`).join(' | ');
  check('Таймкоды: разные форматы и часы разобраны, мусор пропущен', list.length === 5 && list[0].t === 0 && list[0].name === 'Интро' && near(list.find((x) => x.name === 'Финал').t, 3723.5, 1e-9) && list.some((x) => x.name === 'Со списком' && x.t === 240) && list.some((x) => x.name === 'Вторая' && x.t === 310), got);
  const au = parseTracklist('0.000000\t12.500000\tПервый\n12.5\t30,25\tВторой\n40\t41');
  check('Метки Audacity: начало/конец/название', au.length === 3 && au[1].t === 12.5 && au[1].name === 'Второй' && au[2].name === '', JSON.stringify(au));
  check('Таймкоды: сортировка по времени', parseTracklist('05:00 B\n01:00 A')[0].name === 'A', '');
  check('Таймкоды: пустой ввод', parseTracklist('').length === 0 && parseTracklist('просто текст').length === 0, '');
}
{
  check('Формат времени', fmtStamp(65) === '1:05' && fmtStamp(3725) === '1:02:05' && fmtStamp(65.43, 1) === '1:05.4' && fmtStamp(-3) === '0:00', `${fmtStamp(65)} ${fmtStamp(3725)} ${fmtStamp(65.43, 1)}`);
  check('Имена файлов: с названием и без', partFileName('mix', 0, 12, 'Intro: part/1', 'mp3') === '01 - Intro part 1.mp3' && partFileName('my mix', 2, 12, '', 'wav') === 'my mix-03.wav' && partFileName('x', 99, 120, '', 'wav') === 'x-100.wav', `${partFileName('mix', 0, 12, 'Intro: part/1', 'mp3')} | ${partFileName('x', 99, 120, '', 'wav')}`);
}
{
  // рез по нулю: синус 100 Гц, просим рез на пике — сдвигается на ближайший ноль (≤ 2.5 мс при 100 Гц)
  const x = Float32Array.from({ length: SR * 2 }, (_, i) => Math.sin(2 * Math.PI * 100 * (i / SR)));
  const peak = 0.5 + 0.0025; // четверть периода от нуля = пик
  const z = snapToZero([x], SR, peak, 8);
  const v = Math.abs(x[Math.round(z * SR)]);
  check('Привязка к нулю: рез ложится на переход через ноль', v < 0.1 && Math.abs(z - peak) <= 0.0051, `|x|=${v.toFixed(3)}, сдвиг ${(Math.abs(z - peak) * 1000).toFixed(1)} мс`);
  const dc = new Float32Array(SR).fill(0.5);
  check('Привязка к нулю: нет нулей — рез остаётся', snapToZero([dc], SR, 0.5, 8) === 0.5, '');
}
{
  const x = Float32Array.from({ length: SR * 4 }, () => 1);
  const buf = { numberOfChannels: 2, sampleRate: SR, length: x.length, getChannelData: () => x };
  const s = sliceBuffer(buf, 1, 3, 50);
  const d = s.getChannelData(0);
  check('Кусок: длина и фейды по краям', s.length === 2 * SR && d[0] === 0 && d[s.length - 1] === 0 && d[Math.floor(s.length / 2)] === 1 && x[SR] === 1, `len ${s.length}, d0 ${d[0]}`);
  const tiny = sliceBuffer(buf, 3.9999, 4, 50);
  check('Кусок: крошечный не ломается', tiny.length >= 1 && Number.isFinite(tiny.getChannelData(0)[0]), '');
}

console.log(fails ? `\n❌ Провалено: ${fails}` : '\n✅ Все проверки пройдены');
process.exit(fails ? 1 : 0);
