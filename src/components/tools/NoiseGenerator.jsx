import { useEffect, useRef, useState } from 'react';

// Генератор шума (белый / розовый / коричневый) через Web Audio. Для фоновой
// концентрации в работе. Всё локально, ничего не качается.

const TYPES = [
  { id: 'white', ru: 'Белый', en: 'White' },
  { id: 'pink', ru: 'Розовый', en: 'Pink' },
  { id: 'brown', ru: 'Коричневый', en: 'Brown' },
];

const TEXT = {
  ru: { play: 'Включить', stop: 'Выключить', type: 'Тип шума', volume: 'Громкость', hint: 'Белый — ровный, розовый — мягче, коричневый — самый «глубокий».' },
  en: { play: 'Play', stop: 'Stop', type: 'Noise type', volume: 'Volume', hint: 'White is flat, pink is softer, brown is the “deepest”.' },
};

function NoiseGenerator({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [type, setType] = useState('pink');
  const [volume, setVolume] = useState(0.4);
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef(null);
  const nodeRef = useRef(null);
  const gainRef = useRef(null);

  function buildNoiseNode(ctx, kind) {
    const bufferSize = 4 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;
    } else if (kind === 'pink') {
      let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
      for (let i = 0; i < bufferSize; i += 1) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else { // brown
      let last = 0;
      for (let i = 0; i < bufferSize; i += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  function stop() {
    if (nodeRef.current) { try { nodeRef.current.stop(); } catch { /* */ } nodeRef.current.disconnect(); nodeRef.current = null; }
    setPlaying(false);
  }

  function start() {
    stop();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!ctxRef.current) ctxRef.current = new Ctx();
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    if (!gainRef.current) {
      gainRef.current = ctx.createGain();
      gainRef.current.connect(ctx.destination);
    }
    gainRef.current.gain.value = volume;
    const node = buildNoiseNode(ctx, type);
    node.connect(gainRef.current);
    node.start();
    nodeRef.current = node;
    setPlaying(true);
  }

  // Смена типа на лету.
  useEffect(() => {
    if (playing) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Громкость на лету.
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  // Очистка при размонтировании.
  useEffect(() => () => {
    stop();
    if (ctxRef.current) { try { ctxRef.current.close(); } catch { /* */ } }
  }, []);

  return (
    <div className="tool-panel noise-generator">
      <div className="tool-field">
        <span className="tool-field-label">{t.type}</span>
        <div className="segmented">
          {TYPES.map((n) => (
            <button
              key={n.id}
              type="button"
              className={n.id === type ? 'segmented-btn is-active' : 'segmented-btn'}
              onClick={() => setType(n.id)}
            >
              {n[language] || n.ru}
            </button>
          ))}
        </div>
      </div>

      <div className="tool-field">
        <span className="tool-field-label">{t.volume}: {Math.round(volume * 100)}%</span>
        <input type="range" min="0" max="1" step="0.02" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
      </div>

      <button
        type="button"
        className={playing ? 'tool-btn ng-toggle is-playing' : 'tool-btn primary ng-toggle'}
        onClick={() => (playing ? stop() : start())}
      >
        {playing ? `⏹ ${t.stop}` : `▶ ${t.play}`}
      </button>

      <p className="tool-local-note">🎧 {t.hint}</p>
    </div>
  );
}

export default NoiseGenerator;
