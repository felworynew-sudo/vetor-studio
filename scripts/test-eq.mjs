// Проверка модели эквалайзера и общего слоя форматов (без браузера).
// Запуск: node scripts/test-eq.mjs
import {
  BAND_FREQS, GAIN_MAX, PRESETS, autoPreampDb, cascade, defaultModel, isFlat, logFreqs, presetModel, responseDb, sanitizeModel, totalPreDb,
} from '../src/utils/eqModel.js';
import {
  describeSource, encodeLike, formatChoices, guessFormatId, idFromMeta, nearest, outputName, pickBitrate, recompressNote, resolveTarget,
} from '../src/utils/audioFormat.js';

let fails = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
}
const SR = 48000;
const at = (model, f) => responseDb(model, Float64Array.of(f), SR)[0];
const gainsModel = (g) => { const m = defaultModel(); g.forEach((v, i) => { m.bands[i].gain = v; }); return m; };

// 1. АЧХ: колокол +6 на 1 кГц даёт ровно +6 дБ в центре и почти 0 далеко
{
  const m = defaultModel(); m.bands[5].gain = 6;
  check('Колокол: +6 дБ в центре 1 кГц', Math.abs(at(m, 1000) - 6) < 0.05, `${at(m, 1000).toFixed(2)} дБ`);
  check('Колокол: далеко от центра почти ноль', Math.abs(at(m, 40)) < 0.4 && Math.abs(at(m, 15000)) < 0.6, `${at(m, 40).toFixed(2)} / ${at(m, 15000).toFixed(2)}`);
  check('Ровная модель: АЧХ = 0', responseDb(defaultModel(), logFreqs(50), SR).every((v) => Math.abs(v) < 1e-9) && isFlat(defaultModel()), '');
}
// 2. Срезы и полки
{
  const m = defaultModel(); m.hp = { on: true, f: 100 };
  check('HP 24 дБ/окт (Баттерворт): −3 дБ на частоте среза, ≈−24 на октаву ниже', Math.abs(at(m, 100) + 3) < 0.3 && Math.abs(at(m, 50) + 24) < 3, `${at(m, 100).toFixed(1)} / ${at(m, 50).toFixed(1)}`);
  check('HP не трогает середину', Math.abs(at(m, 2000)) < 0.05, '');
  const l = defaultModel(); l.lp = { on: true, f: 8000 };
  check('LP 8 кГц режет верх, не трогает середину', at(l, 16000) < -15 && Math.abs(at(l, 1000)) < 0.05, `${at(l, 16000).toFixed(1)} дБ`);
  const sh = defaultModel(); sh.bands[0] = { type: 'lowshelf', f: 100, q: 0.7071, gain: 6, on: true };
  check('Нижняя полка: +6 внизу, 0 вверху, +3 на частоте полки', Math.abs(at(sh, 20) - 6) < 0.3 && Math.abs(at(sh, 5000)) < 0.1 && Math.abs(at(sh, 100) - 3) < 0.3, `${at(sh, 20).toFixed(1)} / ${at(sh, 100).toFixed(1)} / ${at(sh, 5000).toFixed(2)}`);
  const nt = defaultModel(); nt.bands[5] = { type: 'notch', f: 1000, q: 8, gain: 0, on: true };
  check('Режектор: глубокий провал на частоте, ровно рядом', at(nt, 1000) < -40 && Math.abs(at(nt, 2000)) < 0.5, `${at(nt, 1000).toFixed(0)} дБ`);
}
// 3. Отключённые полосы и каскад
{
  const m = defaultModel(); m.bands[3].gain = 5; m.bands[3].on = false; m.bands[4].gain = 0.004;
  check('Каскад: выключенные и нулевые полосы не попадают в цепочку', cascade(m).length === 0, `${cascade(m).length}`);
  m.hp.on = true; m.lp.on = true; m.bands[2].gain = 3;
  check('Каскад: HP и LP по два биквада + полоса', cascade(m).length === 5, `${cascade(m).length}`);
}
// 4. Авто-предусиление
{
  const m = defaultModel(); m.bands[5].gain = 6;
  const a = autoPreampDb(m, SR);
  check('Авто-предусиление гасит пик подъёма', a <= -5.5 && a >= -7, `${a} дБ`);
  const cut = defaultModel(); cut.bands[5].gain = -6;
  check('Только срезы — предусиление не нужно', autoPreampDb(cut, SR) === 0 || Object.is(autoPreampDb(cut, SR), -0), `${autoPreampDb(cut, SR)}`);
  m.pre = 2; m.autoPre = false;
  check('Итоговая громкость: ручная без авто', totalPreDb(m, SR) === 2, '');
}
// 5. Пресеты
{
  const ids = new Set(PRESETS.map((p) => p.id));
  check('Пресеты: уникальные id, по 10 значений, в пределах ±18', ids.size === PRESETS.length && PRESETS.every((p) => p.gains.length === BAND_FREQS.length && p.gains.every((g) => Math.abs(g) <= GAIN_MAX)), `${PRESETS.length} шт.`);
  check('Пресеты: у каждого есть русское и английское имя', PRESETS.every((p) => p.ru && p.en), '');
  const bass = presetModel('bass-boost');
  check('Пресет «больше баса»: низ вверх, верх без изменений', at(bass, 50) > 3 && Math.abs(at(bass, 8000)) < 0.7, `${at(bass, 50).toFixed(1)} / ${at(bass, 8000).toFixed(2)}`);
  const pod = presetModel('podcast');
  check('Пресет «подкаст»: включает HP и LP', pod.hp.on && pod.hp.f === 70 && pod.lp.on, '');
  check('Пресет «ровная»: модель плоская', isFlat(presetModel('flat')), '');
  check('Пресет неизвестный → null', presetModel('нет-такого') === null, '');
}
// 6. Очистка чужого JSON
{
  const m = sanitizeModel({ bands: [{ type: 'evil', f: 1e9, q: -4, gain: 99 }, null, 'x'], hp: { on: 1, f: 99999 }, pre: 'abc', autoPre: false });
  check('Импорт: типы, границы и мусор приводятся к допустимым', m.bands[0].type === 'peaking' && m.bands[0].f === 20000 && m.bands[0].q === 0.1 && m.bands[0].gain === GAIN_MAX && m.bands.length === 10 && m.hp.f === 500 && m.pre === 0 && m.autoPre === false, JSON.stringify(m.bands[0]));
  check('Импорт: не объект → модель по умолчанию', isFlat(sanitizeModel(null)) && isFlat(sanitizeModel('строка')), '');
}
// 7. Форматы: определение, битрейт, имя, описание
{
  check('Формат по имени/MIME', guessFormatId('a.MP3') === 'mp3' && guessFormatId('x.m4a') === 'aac' && guessFormatId('x.oga') === 'ogg' && guessFormatId('x', 'audio/flac') === 'flac' && guessFormatId('x.bin') === 'other', '');
  check('Формат по контейнеру/кодеку', idFromMeta('MPEG', 'MPEG 1 Layer 3') === 'mp3' && idFromMeta('WAVE', 'PCM') === 'wav' && idFromMeta('FLAC', 'FLAC') === 'flac' && idFromMeta('Ogg', 'Vorbis') === 'ogg' && idFromMeta('Ogg', 'Opus') === 'opus' && idFromMeta('M4A/mp42/isom', 'MPEG-4/AAC') === 'aac' && idFromMeta('', '', 'wav') === 'wav', '');
  check('Битрейт: ближайший стандартный', pickBitrate('mp3', 245) === 256 && pickBitrate('mp3', 128.4) === 128 && pickBitrate('mp3', 319) === 320 && nearest([1, 5, 9], 6) === 5, '');
  check('Битрейт: нет данных → по размеру файла, потом по умолчанию', pickBitrate('mp3', 0, 4800000, 200) === 192 && pickBitrate('mp3', 0, 0, 0) === 192 && pickBitrate('opus', 0, 0, 0) === 128 && pickBitrate('wav', 99) === 0, '');
  check('Имя файла результата', outputName('Мой трек.wav', 'eq', 'flac') === 'Мой трек-eq.flac' && outputName('', '', 'mp3') === 'audio.mp3', '');
  const probe = { id: 'mp3', bitrate: 192, sampleRate: 44100, channels: 2 };
  check('Описание источника', describeSource(probe) === 'MP3 · 192 кбит/с · 44.1 кГц · стерео' && describeSource({ id: 'wav', bits: 24, sampleRate: 48000, channels: 1 }) === 'WAV · 24 бит · 48 кГц · моно', describeSource(probe));
  check('«Как исходный»: сжатый → тот же; неизвестный → WAV', resolveTarget('source', probe).id === 'mp3' && resolveTarget('source', { id: 'other' }).id === 'wav' && resolveTarget('flac', probe).id === 'flac', '');
  check('Список форматов: «как исходный» первым, с названием формата', formatChoices(probe)[0].id === 'source' && formatChoices(probe)[0].label.includes('MP3') && formatChoices(null).length === 7, formatChoices(probe)[0].label);
  check('Предупреждение о повторном сжатии', recompressNote(probe, 'source').length > 0 && recompressNote(probe, 'wav') === '' && recompressNote({ id: 'flac' }, 'mp3') === '', '');
}
// 8. Кодирование WAV в исходной битности (то, что работает без FFmpeg)
{
  const x = Float32Array.from({ length: 4800 }, (_, i) => 0.5 * Math.sin(i / 10));
  for (const [bits, size, tag] of [[16, 4800 * 2 * 2, 1], [24, 4800 * 2 * 3, 1], [32, 4800 * 2 * 4, 3]]) {
    const r = await encodeLike({ chans: [x, x], sr: 48000 }, { id: 'wav', bits, float: bits === 32 }, { target: 'source' });
    const ab = await r.blob.arrayBuffer(); const dv = new DataView(ab);
    check(`WAV ${bits === 32 ? '32 float' : `${bits} бит`}: тот же формат на выходе`, r.ext === 'wav' && ab.byteLength === 44 + size && dv.getUint16(20, true) === tag && dv.getUint16(34, true) === bits, `${ab.byteLength} байт, тег ${dv.getUint16(20, true)}`);
  }
  const mp3 = await encodeLike({ chans: [x, x], sr: 44100 }, { id: 'mp3', bitrate: 192 }, { target: 'source' });
  check('MP3 → MP3 с тем же битрейтом (расширение, mime, ненулевой размер)', mp3.ext === 'mp3' && mp3.mime === 'audio/mpeg' && mp3.blob.size > 100 && mp3.bitrate === 192, `${mp3.blob.size} байт`);
  const w = await encodeLike({ chans: [x], sr: 48000 }, { id: 'mp3' }, { target: 'wav' });
  check('Явный выбор формата перекрывает «как исходный»', w.ext === 'wav' && w.bits === 24, '');
}

console.log(fails ? `\n❌ Провалено: ${fails}` : '\n✅ Все проверки пройдены');
process.exit(fails ? 1 : 0);
