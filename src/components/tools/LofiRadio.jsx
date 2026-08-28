import { useCallback, useEffect, useRef, useState } from 'react';

// Лофи-радио для работы: простая надёжная карусель треков. Один <audio> в DOM,
// по окончании трека — следующий, битый трек пропускаем. Громкость на лету,
// мягкий fade-in при старте трека. Музыка из /lofi, всё локально.

const TRACKS = [
  { src: '/lofi/after-rain-window.mp3', title: 'After Rain Window' },
  { src: '/lofi/after-the-briefing.mp3', title: 'After the Briefing' },
  { src: '/lofi/bayou-dust-loop.mp3', title: 'Bayou Dust Loop' },
  { src: '/lofi/blue-tape-quartet.mp3', title: 'Blue Tape Quartet' },
  { src: '/lofi/cigarette-bowl.mp3', title: 'Cigarette Bowl' },
  { src: '/lofi/late-night-drift.mp3', title: 'Late Night Drift' },
  { src: '/lofi/late-night-quartet.mp3', title: 'Late Night Quartet' },
  { src: '/lofi/late-train-cafe.mp3', title: 'Late Train Cafe' },
  { src: '/lofi/tin-cup-riot.mp3', title: 'Tin Cup Riot' },
];

const TEXT = {
  ru: { start: 'Включить радио', stop: 'Выключить', next: 'Следующий', volume: 'Громкость', now: 'Сейчас играет', hint: 'Фоновая музыка для работы.' },
  en: { start: 'Play radio', stop: 'Stop', next: 'Next', volume: 'Volume', now: 'Now playing', hint: 'Background music for work.' },
};

function LofiRadio({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [title, setTitle] = useState('');

  const audioRef = useRef(null);
  const orderRef = useRef([]);
  const idxRef = useRef(0);
  const volRef = useRef(volume);
  const fadeRef = useRef(0);
  volRef.current = volume;

  function shuffle() {
    const idx = TRACKS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    orderRef.current = idx;
    idxRef.current = 0;
  }

  const fadeIn = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    cancelAnimationFrame(fadeRef.current);
    const start = performance.now(); const dur = 900; a.volume = 0;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      a.volume = Math.max(0, Math.min(1, volRef.current * k));
      if (k < 1) fadeRef.current = requestAnimationFrame(step);
    };
    fadeRef.current = requestAnimationFrame(step);
  }, []);

  const playIndex = useCallback((i) => {
    const a = audioRef.current; if (!a) return;
    const len = orderRef.current.length || TRACKS.length;
    idxRef.current = ((i % len) + len) % len;
    const tr = TRACKS[orderRef.current[idxRef.current] ?? idxRef.current];
    a.src = tr.src;
    setTitle(tr.title);
    const p = a.play();
    if (p && p.then) p.then(fadeIn).catch(() => {}); else fadeIn();
  }, [fadeIn]);

  function start() {
    if (!orderRef.current.length) shuffle();
    setPlaying(true);
    playIndex(idxRef.current);
  }
  function stop() {
    const a = audioRef.current; if (a) a.pause();
    cancelAnimationFrame(fadeRef.current);
    setPlaying(false);
  }
  // Переход по окончании трека + пропуск битого. Слушатели на живом <audio>.
  useEffect(() => {
    const a = audioRef.current; if (!a) return undefined;
    const onEnded = () => playIndex(idxRef.current + 1);
    const onError = () => { if (playing) playIndex(idxRef.current + 1); };
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);
    return () => { a.removeEventListener('ended', onEnded); a.removeEventListener('error', onError); };
  }, [playIndex, playing]);

  // Громкость на лету (fade-in сам её подхватит через volRef).
  useEffect(() => { const a = audioRef.current; if (a) a.volume = volume; }, [volume]);

  useEffect(() => () => { const a = audioRef.current; if (a) { a.pause(); a.src = ''; } cancelAnimationFrame(fadeRef.current); }, []);

  return (
    <div className="tool-panel lofi-radio">
      <audio ref={audioRef} preload="auto" />
      <div className="lofi-art">
        <img src="/tools/lofi-radio.png" alt="" className="lofi-art-img" />
        {playing && <span className="lofi-eq" aria-hidden="true"><i /><i /><i /><i /></span>}
      </div>

      {title && (
        <p className="lofi-now"><span>{t.now}</span> <strong>{title}</strong></p>
      )}

      <div className="lofi-controls">
        <button type="button" className={playing ? 'tool-btn lofi-toggle is-playing' : 'tool-btn primary lofi-toggle'} onClick={() => (playing ? stop() : start())}>
          {playing ? `⏹ ${t.stop}` : `▶ ${t.start}`}
        </button>
        <label className="lofi-volume">
          <span className="tool-field-label">🔊 {t.volume}</span>
          <input type="range" min="0" max="1" step="0.02" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
        </label>
      </div>

      <p className="tool-local-note">🎧 {t.hint}</p>
    </div>
  );
}

export default LofiRadio;
