import { useEffect, useState } from 'react';

// Генератор палитр по настроению: СОЗДАЁТ случайную палитру под выбранное
// настроение (по правилам тона/насыщенности/светлоты), а не показывает заготовки.

const MOODS = {
  cyberpunk: { ru: 'Киберпанк', en: 'Cyberpunk', hues: [250, 270, 290, 315, 190, 220, 300], base: { s: [35, 60], l: [7, 13] }, sec: { s: [45, 70], l: [22, 38] }, acc: { s: [85, 100], l: [50, 64] }, light: { s: [25, 45], l: [80, 90] } },
  neon: { ru: 'Неон', en: 'Neon', hues: [110, 320, 190, 275, 50, 160], base: { s: [10, 25], l: [3, 8] }, sec: { s: [70, 90], l: [20, 35] }, acc: { s: [95, 100], l: [50, 60] }, light: { s: [60, 90], l: [75, 88] } },
  vintage: { ru: 'Винтаж', en: 'Vintage', hues: [25, 40, 15, 80, 10, 35], base: { s: [15, 30], l: [18, 28] }, sec: { s: [20, 40], l: [35, 50] }, acc: { s: [30, 55], l: [45, 65] }, light: { s: [15, 30], l: [80, 90] } },
  cozy: { ru: 'Уют', en: 'Cozy', hues: [20, 30, 35, 90, 15], base: { s: [30, 50], l: [22, 32] }, sec: { s: [35, 55], l: [40, 55] }, acc: { s: [40, 65], l: [55, 72] }, light: { s: [25, 45], l: [85, 93] } },
  nature: { ru: 'Природа', en: 'Nature', hues: [90, 120, 140, 80, 35, 150], base: { s: [25, 45], l: [18, 30] }, sec: { s: [30, 50], l: [35, 50] }, acc: { s: [35, 60], l: [50, 68] }, light: { s: [20, 40], l: [85, 93] } },
  pastel: { ru: 'Пастель', en: 'Pastel', hues: [0, 40, 120, 200, 280, 320, 180], base: { s: [35, 55], l: [82, 88] }, sec: { s: [35, 55], l: [78, 86] }, acc: { s: [40, 60], l: [72, 82] }, light: { s: [20, 40], l: [92, 97] } },
  minimal: { ru: 'Минимализм', en: 'Minimal', hues: [220], base: { s: [0, 6], l: [8, 16] }, sec: { s: [0, 6], l: [30, 45] }, acc: { s: [0, 8], l: [55, 70] }, light: { s: [0, 5], l: [92, 98] } },
  sunset: { ru: 'Закат', en: 'Sunset', hues: [15, 30, 45, 350, 280, 10], base: { s: [40, 70], l: [10, 18] }, sec: { s: [55, 80], l: [30, 45] }, acc: { s: [65, 95], l: [50, 68] }, light: { s: [40, 70], l: [80, 90] } },
};

const TEXT = {
  ru: { mood: 'Настроение', generate: 'Сгенерировать', copy: 'Копировать', copied: 'Скопировано', hint: 'Каждый раз — новая палитра под настроение. Клик по цвету копирует HEX.' },
  en: { mood: 'Mood', generate: 'Generate', copy: 'Copy', copied: 'Copied', hint: 'A fresh palette each time. Click a color to copy the HEX.' },
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function hslToHex(h, s, l) {
  const sn = s / 100; const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0; let g = 0; let b = 0;
  const hh = ((h % 360) + 360) % 360;
  if (hh < 60) { r = c; g = x; } else if (hh < 120) { r = x; g = c; } else if (hh < 180) { g = c; b = x; } else if (hh < 240) { g = x; b = c; } else if (hh < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function generate(m) {
  const H = () => pick(m.hues) + rand(-7, 7);
  const S = (r) => rand(r[0], r[1]);
  const L = (r) => rand(r[0], r[1]);
  return [
    hslToHex(H(), S(m.base.s), L(m.base.l)),
    hslToHex(H(), S(m.sec.s), L(m.sec.l)),
    hslToHex(H(), S(m.acc.s), L(m.acc.l)),
    hslToHex(H(), S(m.acc.s), L(m.acc.l)),
    hslToHex(H(), S(m.light.s), L(m.light.l)),
  ];
}

function MoodPalettes({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [moodId, setMoodId] = useState('cyberpunk');
  const [palette, setPalette] = useState([]);
  const [copied, setCopied] = useState('');

  useEffect(() => { setPalette(generate(MOODS[moodId])); }, [moodId]);

  function copy(c) {
    if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => { setCopied(c); setTimeout(() => setCopied(''), 1000); }).catch(() => {});
  }
  function copyAll() {
    if (navigator.clipboard && palette.length) navigator.clipboard.writeText(palette.join(', ')).then(() => { setCopied('all'); setTimeout(() => setCopied(''), 1400); }).catch(() => {});
  }

  return (
    <div className="tool-panel mood-palettes">
      <div className="tool-field">
        <span className="tool-field-label">{t.mood}</span>
        <div className="mood-tags">
          {Object.entries(MOODS).map(([id, m]) => (
            <button key={id} type="button" className={id === moodId ? 'mood-tag is-active' : 'mood-tag'} onClick={() => setMoodId(id)}>
              {m[language] || m.ru}
            </button>
          ))}
        </div>
      </div>

      <div className="mood-palette mood-generated">
        {palette.map((c, i) => (
          <button key={`${c}-${i}`} type="button" className="mood-swatch" style={{ background: c }} onClick={() => copy(c)} title={c}>
            <span>{copied === c ? '✓' : c.toUpperCase()}</span>
          </button>
        ))}
      </div>

      <div className="tool-actions">
        <button type="button" className="tool-btn primary" onClick={() => setPalette(generate(MOODS[moodId]))}>🎲 {t.generate}</button>
        <button type="button" className="tool-btn" onClick={copyAll}>{copied === 'all' ? `✓ ${t.copied}` : t.copy}</button>
      </div>

      <p className="tool-local-note">🎨 {t.hint}</p>
    </div>
  );
}

export default MoodPalettes;
