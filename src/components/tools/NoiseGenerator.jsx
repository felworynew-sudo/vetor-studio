import { useEffect, useRef, useState } from 'react';
import { TRACKS } from './LofiRadio';

// Генератор шума (белый / розовый / коричневый) для концентрации. Шум считается
// непрерывно в AudioWorklet — без повторяющегося куска и слышимого шва. Старт, стоп
// и смена типа — плавные (без щелчков). Таймер выключения по часам, а не по тикам,
// и подмешивание лофи-радио со своей громкостью. Всё локально, ничего не качается.

const TYPES = [
  { id: 'white', ru: 'Белый', en: 'White' },
  { id: 'pink', ru: 'Розовый', en: 'Pink' },
  { id: 'brown', ru: 'Коричневый', en: 'Brown' },
];
const TIMERS = [0, 15, 25, 45, 60, 90];

const TEXT = {
  ru: {
    play: 'Включить', stop: 'Выключить', type: 'Тип шума', volume: 'Громкость', timer: 'Выключить через',
    off: 'нет', min: 'мин', left: 'осталось', lofi: 'Подмешать лофи', lofiVol: 'Громкость лофи', now: 'Играет',
    hint: 'Белый — ровный, розовый — мягче, коричневый — самый «глубокий». В конце таймера звук плавно затихает.',
    noAudio: 'Браузер не поддерживает Web Audio.',
  },
  en: {
    play: 'Play', stop: 'Stop', type: 'Noise type', volume: 'Volume', timer: 'Stop after',
    off: 'off', min: 'min', left: 'left', lofi: 'Mix in lo-fi', lofiVol: 'Lo-fi volume', now: 'Playing',
    hint: 'White is flat, pink is softer, brown is the “deepest”. The sound fades out when the timer ends.',
    noAudio: 'This browser does not support Web Audio.',
  },
};

// Генератор шума внутри AudioWorklet: розовый — фильтр Пола Келлета, коричневый —
// интегрированный белый с утечкой. Тип меняется сообщением, без пересоздания узла.
const WORKLET = `
class NoiseProc extends AudioWorkletProcessor {
  constructor() {
    super(); this.kind = 'pink'; this.b = new Float32Array(7); this.last = 0;
    this.port.onmessage = (e) => { this.kind = e.data; };
  }
  process(_, outputs) {
    const out = outputs[0]; const ch0 = out[0]; const b = this.b;
    for (let i = 0; i < ch0.length; i++) {
      const w = Math.random() * 2 - 1; let v;
      if (this.kind === 'white') v = w * 0.5;
      else if (this.kind === 'pink') {
        b[0] = 0.99886 * b[0] + w * 0.0555179; b[1] = 0.99332 * b[1] + w * 0.0750759;
        b[2] = 0.969 * b[2] + w * 0.153852; b[3] = 0.8665 * b[3] + w * 0.3104856;
        b[4] = 0.55 * b[4] + w * 0.5329522; b[5] = -0.7616 * b[5] - w * 0.016898;
        v = (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362) * 0.11; b[6] = w * 0.115926;
      } else { this.last = (this.last + 0.02 * w) / 1.02; v = this.last * 3.5; }
      ch0[i] = v;
      for (let c = 1; c < out.length; c++) out[c][i] = v;
    }
    return true;
  }
}
registerProcessor('vetor-noise', NoiseProc);
`;

const FADE = 0.35; // с — постоянная времени плавного входа/выхода

function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function NoiseGenerator({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [type, setType] = useState('pink');
  const [volume, setVolume] = useState(0.4);
  const [playing, setPlaying] = useState(false);
  const [timer, setTimer] = useState(0);
  const [endAt, setEndAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [lofi, setLofi] = useState(false);
  const [lofiVol, setLofiVol] = useState(0.5);
  const [track, setTrack] = useState('');
  const [error, setError] = useState('');

  const ctxRef = useRef(null);
  const nodeRef = useRef(null);
  const gainRef = useRef(null);
  const lofiGainRef = useRef(null);
  const audioRef = useRef(null);
  const orderRef = useRef([]);
  const stopTimerRef = useRef(0);
  const lofiRef = useRef(lofi);
  lofiRef.current = lofi;

  async function ensureGraph() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !window.AudioWorkletNode) throw new Error(t.noAudio);
    if (!ctxRef.current) {
      const ctx = new Ctx();
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
      const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
      const node = new AudioWorkletNode(ctx, 'vetor-noise', { outputChannelCount: [2] });
      node.connect(gain);
      const lg = ctx.createGain(); lg.gain.value = 0; lg.connect(ctx.destination);
      const audio = audioRef.current;
      ctx.createMediaElementSource(audio).connect(lg);
      ctxRef.current = ctx; nodeRef.current = node; gainRef.current = gain; lofiGainRef.current = lg;
    }
    if (ctxRef.current.state === 'suspended') await ctxRef.current.resume();
    return ctxRef.current;
  }

  const ramp = (g, v) => { const ctx = ctxRef.current; if (g && ctx) { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(v, ctx.currentTime, FADE / 3); } };

  function nextTrack() {
    const a = audioRef.current; if (!a) return;
    if (!orderRef.current.length) orderRef.current = TRACKS.map((_, i) => i).sort(() => Math.random() - 0.5);
    const tr = TRACKS[orderRef.current.shift()];
    a.src = tr.src; setTrack(tr.title);
    a.play().catch(() => {});
  }

  async function start() {
    try {
      await ensureGraph();
      nodeRef.current.port.postMessage(type);
      ramp(gainRef.current, volume);
      if (lofi) { if (!audioRef.current.src) nextTrack(); else audioRef.current.play().catch(() => {}); ramp(lofiGainRef.current, lofiVol); }
      setPlaying(true); setError('');
      if (timer) setEndAt(Date.now() + timer * 60000);
    } catch (e) { setError(e.message || t.noAudio); }
  }

  function stop() {
    ramp(gainRef.current, 0); ramp(lofiGainRef.current, 0);
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => { audioRef.current?.pause(); ctxRef.current?.suspend(); }, FADE * 3000);
    setPlaying(false); setEndAt(0);
  }

  // Смена типа: короткий провал громкости вместо щелчка.
  useEffect(() => {
    if (!playing || !nodeRef.current) return undefined;
    ramp(gainRef.current, 0);
    const id = setTimeout(() => { nodeRef.current.port.postMessage(type); ramp(gainRef.current, volume); }, 180);
    return () => clearTimeout(id);
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (playing) ramp(gainRef.current, volume); }, [volume]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (playing && lofi) ramp(lofiGainRef.current, lofiVol); }, [lofiVol]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return;
    if (lofi) { if (!audioRef.current.src) nextTrack(); else audioRef.current.play().catch(() => {}); ramp(lofiGainRef.current, lofiVol); }
    else { ramp(lofiGainRef.current, 0); setTimeout(() => { if (!lofiRef.current) audioRef.current?.pause(); }, FADE * 3000); }
  }, [lofi]); // eslint-disable-line react-hooks/exhaustive-deps

  // Таймер: сверяемся с часами, поэтому заторможенная фоновая вкладка не сбивает время.
  useEffect(() => {
    if (playing) setEndAt(timer ? Date.now() + timer * 60000 : 0);
  }, [timer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!endAt) return undefined;
    const tick = () => { const n = Date.now(); setNow(n); if (n >= endAt) stop(); };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const a = audioRef.current;
    const onEnd = () => nextTrack();
    a.addEventListener('ended', onEnd); a.addEventListener('error', onEnd);
    return () => {
      a.removeEventListener('ended', onEnd); a.removeEventListener('error', onEnd);
      clearTimeout(stopTimerRef.current); a.pause();
      if (ctxRef.current) { try { ctxRef.current.close(); } catch { /* */ } }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tool-panel noise-generator">
      <audio ref={audioRef} preload="none" />
      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.type}</span>
          <div className="segmented">
            {TYPES.map((n) => (
              <button key={n.id} type="button" className={n.id === type ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setType(n.id)}>{n[language] || n.ru}</button>
            ))}
          </div>
        </div>
        <label className="tool-field">
          <span className="tool-field-label">{t.volume}: {Math.round(volume * 100)}%</span>
          <input type="range" min="0" max="1" step="0.02" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
        </label>
        <div className="tool-field">
          <span className="tool-field-label">{t.timer}{endAt ? ` · ${t.left} ${fmtLeft(endAt - now)}` : ''}</span>
          <div className="segmented">
            {TIMERS.map((m) => (
              <button key={m} type="button" className={m === timer ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTimer(m)}>{m ? `${m} ${t.min}` : t.off}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="tool-controls">
        <label className="wm-check" style={{ alignSelf: 'flex-end' }}>
          <input type="checkbox" checked={lofi} onChange={(e) => setLofi(e.target.checked)} />📻 {t.lofi}
        </label>
        {lofi && (
          <label className="tool-field">
            <span className="tool-field-label">{t.lofiVol}: {Math.round(lofiVol * 100)}%</span>
            <input type="range" min="0" max="1" step="0.02" value={lofiVol} onChange={(e) => setLofiVol(Number(e.target.value))} />
          </label>
        )}
        {lofi && playing && track && <p className="lofi-now" style={{ alignSelf: 'flex-end' }}><span>{t.now}</span> <strong>{track}</strong></p>}
      </div>

      <button type="button" className={playing ? 'tool-btn ng-toggle is-playing' : 'tool-btn primary ng-toggle'} onClick={() => (playing ? stop() : start())}>
        {playing ? `⏹ ${t.stop}` : `▶ ${t.play}`}
      </button>
      {error && <p className="color-invalid">{error}</p>}

      <p className="tool-local-note">🎧 {t.hint}</p>
    </div>
  );
}

export default NoiseGenerator;
