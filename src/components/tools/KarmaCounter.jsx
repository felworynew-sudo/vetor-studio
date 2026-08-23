import { useEffect, useState } from 'react';

// Счётчик правок (Karma Counter): шуточный трекер количества правок от клиента
// с «ачивками». Хранится локально в localStorage.

const KEY = 'vetor-karma-count';

const TIERS = {
  ru: [
    { at: 0, label: 'Чистый холст', emoji: '🌱' },
    { at: 5, label: 'Тёплый старт', emoji: '☕' },
    { at: 15, label: 'Итеративный дзен', emoji: '🧘' },
    { at: 30, label: 'Мастер компромисса', emoji: '🛡️' },
    { at: 50, label: '«Сделайте как было»', emoji: '🔁' },
    { at: 80, label: 'Легенда терпения', emoji: '🏆' },
    { at: 120, label: 'Просветление', emoji: '🌟' },
  ],
  en: [
    { at: 0, label: 'Blank canvas', emoji: '🌱' },
    { at: 5, label: 'Warm start', emoji: '☕' },
    { at: 15, label: 'Iterative zen', emoji: '🧘' },
    { at: 30, label: 'Compromise master', emoji: '🛡️' },
    { at: 50, label: '“Revert it back”', emoji: '🔁' },
    { at: 80, label: 'Patience legend', emoji: '🏆' },
    { at: 120, label: 'Enlightenment', emoji: '🌟' },
  ],
};

const TEXT = {
  ru: { title: 'Правок от клиента', add: '+1 правка', undo: 'Отменить', reset: 'Сброс', next: 'До следующей ачивки', hint: 'Данные хранятся только в вашем браузере.' },
  en: { title: 'Client revisions', add: '+1 revision', undo: 'Undo', reset: 'Reset', next: 'To next achievement', hint: 'Data is stored only in your browser.' },
};

function tierFor(tiers, n) {
  let cur = tiers[0]; let next = null;
  for (const t of tiers) { if (n >= t.at) cur = t; else { next = t; break; } }
  return { cur, next };
}

function KarmaCounter({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const tiers = TIERS[language] || TIERS.ru;
  const [count, setCount] = useState(0);

  useEffect(() => {
    try { const v = parseInt(localStorage.getItem(KEY) || '0', 10); if (!Number.isNaN(v)) setCount(v); } catch { /* */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, String(count)); } catch { /* */ }
  }, [count]);

  const { cur, next } = tierFor(tiers, count);

  return (
    <div className="tool-panel karma-counter">
      <div className="kc-display">
        <span className="kc-emoji">{cur.emoji}</span>
        <span className="kc-count">{count}</span>
        <span className="kc-title">{t.title}</span>
        <span className="kc-tier">{cur.label}</span>
      </div>

      {next && (
        <p className="kc-next">{t.next} «{next.label}»: <strong>{next.at - count}</strong></p>
      )}

      <div className="tool-actions kc-actions">
        <button type="button" className="tool-btn primary kc-add" onClick={() => setCount((c) => c + 1)}>{t.add}</button>
        <button type="button" className="tool-btn" onClick={() => setCount((c) => Math.max(0, c - 1))}>{t.undo}</button>
        <button type="button" className="tool-btn ghost" onClick={() => setCount(0)}>{t.reset}</button>
      </div>

      <p className="tool-local-note">🔒 {t.hint}</p>
    </div>
  );
}

export default KarmaCounter;
