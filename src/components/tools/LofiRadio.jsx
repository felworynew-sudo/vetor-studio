import { useEffect, useRef, useState } from 'react';

// Лофи-радио для работы. Без плеера — только старт/стоп и громкость. Треки
// переключаются плавным кроссфейдом: последние секунды текущего затухают, пока
// следующий уже нарастает. Всё локально, музыка из /lofi.

const CROSSFADE = 6; // секунды перекрытия
const PRELOAD_LEAD = 22; // за сколько секунд до конца буферизуем следующий трек
const STALL_MS = 5000; // если позиция не двигается дольше — считаем зависанием и перескакиваем

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

// Плавная рампа громкости с отменой: новый вызов на том же элементе гасит
// старый (иначе fade-in и fade-out дерутся за volume).
function rampVolume(audio, from, to, secs, done) {
  const token = (audio._fadeToken = (audio._fadeToken || 0) + 1);
  const start = performance.now();
  const dur = Math.max(1, secs * 1000);
  function step(now) {
    if (audio._fadeToken !== token) return; // отменён более новой рампой
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
  const preloadedFor = useRef(-1); // какой pos уже забуферизован в свободном плеере
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
    preloadedFor.current = -1;
  }

  function trackAt(p) { return TRACKS[order.current[((p % order.current.length) + order.current.length) % order.current.length]]; }

  // Заранее грузим следующий трек в свободный плеер, чтобы к моменту кроссфейда
  // он уже был забуферизован (иначе между треками возникает пауза на загрузку).
  function preloadNext() {
    const nextPos = pos.current + 1;
    if (preloadedFor.current === nextPos) return;
    const idle = players.current[1 - cur.current];
    idle.pause();
    idle.src = trackAt(nextPos).src;
    idle.volume = 0;
    try { idle.load(); } catch { /* */ }
    preloadedFor.current = nextPos;
  }

  function onTimeUpdate(playerIdx) {
    if (playerIdx !== cur.current || crossing.current) return;
    const a = players.current[playerIdx];
    if (!a.duration || Number.isNaN(a.duration)) return;
    const remaining = a.duration - a.currentTime;
    if (remaining <= PRELOAD_LEAD) preloadNext();
    if (remaining <= CROSSFADE) doCrossfade();
  }

  // Кроссфейд: запускаем следующий плеер и переключаемся на него ТОЛЬКО когда он
  // реально заиграл (play() зарезолвился). Если не смог — перескакиваем дальше,
  // чтобы радио не заглохло в тишине.
  function doCrossfade() {
    if (crossing.current) return;
    crossing.current = true;
    const oldIdx = cur.current;
    const newIdx = 1 - oldIdx;
    const oldP = players.current[oldIdx];
    const newP = players.current[newIdx];
    pos.current += 1;
    if (preloadedFor.current !== pos.current) {
      newP.src = trackAt(pos.current).src;
      try { newP.load(); } catch { /* */ }
    }
    newP.volume = 0;
    attachHandlers(newP, newIdx);
    setTitle(trackAt(pos.current).title);
    preloadedFor.current = -1;

    const begin = () => {
      cur.current = newIdx;
      rampVolume(newP, 0, volRef.current, CROSSFADE);
      rampVolume(oldP, oldP.volume, 0, CROSSFADE, () => {
        oldP.pause();
        crossing.current = false;
        preloadNext();
      });
    };
    const p = newP.play();
    if (p && p.then) {
      p.then(begin).catch(() => { crossing.current = false; skipNow(); });
    } else { begin(); }
  }

  // Жёсткий перескок на следующий трек (после сбоя/зависания) — короткий фейд.
  function skipNow() {
    const oldIdx = cur.current;
    const newIdx = 1 - oldIdx;
    const oldP = players.current[oldIdx];
    const newP = players.current[newIdx];
    pos.current += 1;
    preloadedFor.current = -1;
    newP.src = trackAt(pos.current).src;
    newP.volume = 0;
    attachHandlers(newP, newIdx);
    setTitle(trackAt(pos.current).title);
    const p = newP.play();
    const begin = () => {
      cur.current = newIdx;
      crossing.current = false;
      rampVolume(newP, 0, volRef.current, 1.2);
      rampVolume(oldP, oldP.volume, 0, 0.8, () => oldP.pause());
      preloadNext();
    };
    if (p && p.then) p.then(begin).catch(() => { crossing.current = false; }); else begin();
  }

  function attachHandlers(a, playerIdx) {
    a.ontimeupdate = () => onTimeUpdate(playerIdx);
    // Если кроссфейд почему-то не сработал и трек доиграл — сразу перескакиваем.
    a.onended = () => { if (playerIdx === cur.current && !crossing.current) skipNow(); };
    a.onerror = () => { if (playerIdx === cur.current && !crossing.current) skipNow(); };
  }

  function startTrack(playerIdx, trackPos, fadeIn) {
    const a = players.current[playerIdx];
    const tr = trackAt(trackPos);
    a.src = tr.src;
    a.volume = fadeIn ? 0 : volRef.current;
    attachHandlers(a, playerIdx);
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
    setTitle(tr.title);
    if (fadeIn) rampVolume(a, 0, volRef.current, CROSSFADE);
  }

  function start() {
    ensurePlayers();
    shuffle();
    cur.current = 0;
    crossing.current = false;
    startTrack(0, 0, true);
    setPlaying(true);
  }

  function stop() {
    players.current.forEach((a) => {
      rampVolume(a, a.volume, 0, 0.6, () => { a.pause(); a.ontimeupdate = null; a.onended = null; a.onerror = null; });
    });
    crossing.current = false;
    setPlaying(false);
  }

  // Вотчдог: если позиция активного плеера не двигается дольше STALL_MS —
  // считаем, что радио зависло (сеть/декодер), и перескакиваем на следующий трек.
  useEffect(() => {
    if (!playing) return undefined;
    let lastT = -1;
    let stuckSince = 0;
    const id = setInterval(() => {
      const a = players.current[cur.current];
      if (!a || a.paused || crossing.current) { stuckSince = 0; return; }
      if (Math.abs(a.currentTime - lastT) < 0.01) {
        if (!stuckSince) stuckSince = Date.now();
        else if (Date.now() - stuckSince > STALL_MS) { stuckSince = 0; skipNow(); }
      } else { lastT = a.currentTime; stuckSince = 0; }
    }, 1000);
    return () => clearInterval(id);
  }, [playing]);

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
