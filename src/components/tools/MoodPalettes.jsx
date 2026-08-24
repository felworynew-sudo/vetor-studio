import { useState } from 'react';

// Генератор палитр по настроению: подбор цветов по эмоциональным тегам.
// Кураторские наборы, всё локально.

const MOODS = [
  { id: 'cyberpunk', ru: 'Киберпанк', en: 'Cyberpunk', palettes: [
    ['#0d0221', '#ff2a6d', '#05d9e8', '#d1f7ff', '#005678'],
    ['#120458', '#f706cf', '#00e0ff', '#fdca40', '#0a0a0a'],
    ['#1a0033', '#ff006e', '#8338ec', '#3a86ff', '#06ffa5'],
  ] },
  { id: 'vintage', ru: 'Винтаж', en: 'Vintage', palettes: [
    ['#2b2118', '#a44a3f', '#d3a625', '#c9b79c', '#5f6f52'],
    ['#3e2723', '#8d6e63', '#d7ccc8', '#a1887f', '#bcaaa4'],
    ['#463f3a', '#8a817c', '#bcb8b1', '#e0afa0', '#f4f3ee'],
  ] },
  { id: 'cozy', ru: 'Уют', en: 'Cozy', palettes: [
    ['#4a3728', '#a9714b', '#d9a86c', '#f2d7b6', '#8b9a7b'],
    ['#5c3d2e', '#b85c38', '#e0c097', '#fff3e6', '#7d9d9c'],
    ['#6d4c41', '#d7a86e', '#f0e0c8', '#a3b18a', '#588157'],
  ] },
  { id: 'neon', ru: 'Неон', en: 'Neon', palettes: [
    ['#03001c', '#5b2a86', '#c724b1', '#e94560', '#0ff0fc'],
    ['#0a0a0a', '#39ff14', '#ff073a', '#00fff7', '#fe00fe'],
    ['#10002b', '#e0aaff', '#c77dff', '#7b2cbf', '#3c096c'],
  ] },
  { id: 'nature', ru: 'Природа', en: 'Nature', palettes: [
    ['#283618', '#606c38', '#a3b18a', '#dda15e', '#bc6c25'],
    ['#1b4332', '#2d6a4f', '#74c69d', '#b7e4c7', '#d8f3dc'],
    ['#344e41', '#588157', '#a3b18a', '#dad7cd', '#3a5a40'],
  ] },
  { id: 'pastel', ru: 'Пастель', en: 'Pastel', palettes: [
    ['#ffd6e0', '#ffef9f', '#c1f7dc', '#c9e4ff', '#e6c9ff'],
    ['#fbe0e0', '#fdf5c9', '#d8f5e3', '#d6e6ff', '#f0d9ff'],
    ['#ffcad4', '#f4acb7', '#9d8189', '#d8e2dc', '#ffe5d9'],
  ] },
  { id: 'minimal', ru: 'Минимализм', en: 'Minimal', palettes: [
    ['#ffffff', '#f4f4f4', '#cccccc', '#333333', '#000000'],
    ['#f8f9fa', '#e9ecef', '#adb5bd', '#495057', '#212529'],
    ['#faf9f6', '#e3e3e0', '#a8a89f', '#4d4d47', '#1a1a17'],
  ] },
  { id: 'sunset', ru: 'Закат', en: 'Sunset', palettes: [
    ['#0d1b2a', '#415a77', '#e0a458', '#f4845f', '#f27059'],
    ['#22223b', '#4a4e69', '#c9ada7', '#f2a65a', '#ee964b'],
    ['#03071e', '#370617', '#dc2f02', '#f48c06', '#ffba08'],
  ] },
];

const TEXT = {
  ru: { mood: 'Настроение', copy: 'Копировать', copied: 'Скопировано', hint: 'Готовые сочетания под эмоцию — кликните цвет, чтобы скопировать HEX.' },
  en: { mood: 'Mood', copy: 'Copy', copied: 'Copied', hint: 'Ready combos by mood — click a color to copy the HEX.' },
};

function MoodPalettes({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [moodId, setMoodId] = useState('cyberpunk');
  const [copied, setCopied] = useState('');
  const mood = MOODS.find((m) => m.id === moodId) || MOODS[0];

  function copy(c) {
    if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => { setCopied(c); setTimeout(() => setCopied(''), 1000); }).catch(() => {});
  }

  return (
    <div className="tool-panel mood-palettes">
      <div className="mood-tags">
        {MOODS.map((m) => (
          <button key={m.id} type="button" className={m.id === moodId ? 'mood-tag is-active' : 'mood-tag'} onClick={() => setMoodId(m.id)}>
            {m[language] || m.ru}
          </button>
        ))}
      </div>

      <div className="mood-list">
        {mood.palettes.map((pal, i) => (
          <div key={i} className="mood-palette">
            {pal.map((c) => (
              <button key={c} type="button" className="mood-swatch" style={{ background: c }} onClick={() => copy(c)} title={c}>
                <span>{copied === c ? '✓' : c.toUpperCase()}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <p className="tool-local-note">🎨 {t.hint}</p>
    </div>
  );
}

export default MoodPalettes;
