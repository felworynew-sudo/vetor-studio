import { useState } from 'react';

// Генератор дизайн-челленджей для портфолио: случайная связка объект + аудитория
// + стиль + палитра. Полностью локально, без данных снаружи.

const DATA = {
  ru: {
    what: ['экран заказа еды', 'приложение для медитации', 'лендинг фестиваля', 'дашборд аналитики', 'мобильный банк', 'сайт-портфолио', 'экран онбординга', 'плеер подкастов', 'систему бронирования', 'магазин растений', 'трекер привычек', 'афишу концерта', 'меню ресторана', 'экран доставки', 'страницу события'],
    who: ['для космонавтов', 'для детей', 'для пенсионеров', 'для геймеров', 'для фрилансеров', 'для путешественников', 'для музыкантов', 'для врачей', 'для фермеров', 'для киберспортсменов', 'для художников', 'для родителей'],
    style: ['минимализм', 'неоновый киберпанк', 'ретро 80-х', 'брутализм', 'мягкий неоморфизм', 'скандинавский стиль', 'ар-деко', 'винтажная печать', 'глассморфизм', 'эко-натуральный', 'тёмная тема', 'игривый мемфис'],
    label: { what: 'Задача', who: 'Аудитория', style: 'Стиль', palette: 'Палитра', roll: 'Сгенерировать', copy: 'Копировать', copied: 'Скопировано', title: 'Спроектируй' },
  },
  en: {
    what: ['a food ordering screen', 'a meditation app', 'a festival landing page', 'an analytics dashboard', 'a mobile bank', 'a portfolio site', 'an onboarding screen', 'a podcast player', 'a booking system', 'a plant shop', 'a habit tracker', 'a concert poster', 'a restaurant menu', 'a delivery screen', 'an event page'],
    who: ['for astronauts', 'for kids', 'for seniors', 'for gamers', 'for freelancers', 'for travelers', 'for musicians', 'for doctors', 'for farmers', 'for esports fans', 'for artists', 'for parents'],
    style: ['minimalism', 'neon cyberpunk', '80s retro', 'brutalism', 'soft neumorphism', 'Scandinavian', 'art deco', 'vintage print', 'glassmorphism', 'eco-natural', 'dark theme', 'playful Memphis'],
    label: { what: 'Task', who: 'Audience', style: 'Style', palette: 'Palette', roll: 'Generate', copy: 'Copy', copied: 'Copied', title: 'Design' },
  },
};

const PALETTES = [
  ['#0d0d11', '#6166ff', '#ff5c63'],
  ['#f5f7fb', '#1f8a70', '#ffb703'],
  ['#2b2d42', '#8d99ae', '#ef233c'],
  ['#1a1423', '#f72585', '#4cc9f0'],
  ['#264653', '#2a9d8f', '#e9c46a'],
  ['#fefae0', '#606c38', '#bc6c25'],
  ['#03071e', '#ff9e00', '#ffffff'],
];

function pick(arr, seed) {
  return arr[Math.floor(seed * arr.length) % arr.length];
}

function DesignChallenge({ language = 'ru' }) {
  const d = DATA[language] || DATA.ru;
  const L = d.label;
  const [seed, setSeed] = useState(() => [0.13, 0.37, 0.61, 0.29]);
  const [copied, setCopied] = useState(false);

  // Без Math.random в SSR-безопасном виде: крутим на клике через performance.now.
  function roll() {
    const base = (typeof performance !== 'undefined' ? performance.now() : 1) % 1000 / 1000;
    setSeed([
      (base * 7.13) % 1,
      (base * 13.7 + 0.21) % 1,
      (base * 3.91 + 0.53) % 1,
      (base * 17.3 + 0.11) % 1,
    ]);
    setCopied(false);
  }

  const what = pick(d.what, seed[0]);
  const who = pick(d.who, seed[1]);
  const style = pick(d.style, seed[2]);
  const palette = pick(PALETTES, seed[3]);

  const brief = language === 'ru'
    ? `${L.title} ${what} ${who} в стиле «${style}».`
    : `${L.title} ${what} ${who} in ${style} style.`;

  function copy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`${brief} ${L.palette}: ${palette.join(', ')}`).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }).catch(() => {});
    }
  }

  return (
    <div className="tool-panel design-challenge">
      <p className="dc-brief">{brief}</p>

      <div className="dc-tags">
        <span className="dc-tag"><em>{L.what}</em>{what}</span>
        <span className="dc-tag"><em>{L.who}</em>{who}</span>
        <span className="dc-tag"><em>{L.style}</em>{style}</span>
      </div>

      <div className="dc-palette">
        <span className="dc-palette-label">{L.palette}</span>
        <div className="dc-palette-row">
          {palette.map((c) => (
            <span key={c} className="dc-palette-color" style={{ background: c }}>{c}</span>
          ))}
        </div>
      </div>

      <div className="tool-actions">
        <button type="button" className="tool-btn primary" onClick={roll}>🎲 {L.roll}</button>
        <button type="button" className="tool-btn" onClick={copy}>{copied ? `✓ ${L.copied}` : L.copy}</button>
      </div>
    </div>
  );
}

export default DesignChallenge;
