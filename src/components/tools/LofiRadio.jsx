import { useEffect, useRef, useState } from 'react';

// Лофи-радио для работы. Без плеера — только старт/стоп и громкость. Треки
// переключаются плавным кроссфейдом: последние секунды текущего затухают, пока
// следующий уже нарастает. Всё локально, музыка из /lofi.

const CROSSFADE = 6; // секунды перекрытия

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
  ru: { start: 'Включить радио', stop: 'Выключить', volume: 'Громкость', now: 'Сейчас играет', hint: 'Фоновая музыка для работы.' },
  en: { start: 'Play radio', stop: 'Stop', volume: 'Volume', now: 'Now playing', hint: 'Background music for work.' },
};

function rampVolume(audio, from, to, secs, done) {
  const start = performance.now();
  const dur = Math.max(1, secs * 1000);
  function step(now) {
    if (audio.paused && to === 0) { if (done) done(); return; }
    const k = Math.min(1, (now - start) / dur);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else if (done) done();
  }
  requestAnimationFrame(step);
}

function LofiRadio({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [title, setTitle] = useState('');

  const players = useRef([]);
  const cur = useRef(0);
  const order = useRef([]);
  const pos = useRef(0);
  const crossing = useRef(false);
  const volRef = useRef(volume);
  volRef.current = volume;

  function ensurePlayers() {
    if (players.current.length === 0) {
      const a = new Audio(); const b = new Audio();
      [a, b].forEach((au) => { au.preload = 'auto'; au.crossOrigin = 'anonymous'; });
      players.current = [a, b];
    }
  }

  function shuffle() {
    const idx = TRACKS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    order.current = idx;
    pos.current = 0;
  }

  function trackAt(p) { return TRACKS[order.current[((p % order.current.length) + order.current.length) % order.current.length]]; }

  function maybeCrossfade(playerIdx) {
    if (playerIdx !== cur.current || crossing.current) return;
    const a = players.current[playerIdx];
    if (!a.duration || Number.isNaN(a.duration)) return;
    if (a.duration - a.currentTime <= CROSSFADE) {
      crossing.current = true;
      const nextIdx = 1 - playerIdx;
      pos.current += 1;
      startTrack(nextIdx, pos.current, true);
      cur.current = nextIdx;
      rampVolume(a, a.volume, 0, CROSSFADE, () => { a.pause(); crossing.current = false; });
    }
  }

  function startTrack(playerIdx, trackPos, fadeIn) {
    const a = players.current[playerIdx];
    const tr = trackAt(trackPos);
    a.src = tr.src;
    a.currentTime = 0;
    a.volume = fadeIn ? 0 : volRef.current;
    a.ontimeupdate = () => maybeCrossfade(playerIdx);
    a.onended = () => { if (playerIdx === cur.current && !crossing.current) { pos.current += 1; startTrack(playerIdx, pos.current, false); } };
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
    setTitle(tr.title);
    if (fadeIn) rampVolume(a, 0, volRef.current, CROSSFADE);
  }

  function start() {
    ensurePlayers();
    shuffle();
    cur.current = 0;
    startTrack(0, 0, true);
    setPlaying(true);
  }

  function stop() {
    players.current.forEach((a) => {
      rampVolume(a, a.volume, 0, 0.6, () => { a.pause(); a.ontimeupdate = null; a.onended = null; });
    });
    crossing.current = false;
    setPlaying(false);
  }

  // Громкость на лету (когда не идёт кроссфейд).
  useEffect(() => {
    if (!playing || crossing.current) return;
    const a = players.current[cur.current];
    if (a) a.volume = volume;
  }, [volume, playing]);

  // Очистка при размонтировании.
  useEffect(() => () => {
    players.current.forEach((a) => { try { a.pause(); a.src = ''; } catch { /* */ } });
  }, []);

  return (
    <div className="tool-panel lofi-radio">
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
