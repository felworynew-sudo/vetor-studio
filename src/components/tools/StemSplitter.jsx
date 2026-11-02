import { useEffect, useRef, useState } from 'react';
import { aiBrowserHint } from '../../utils/aiSupport';

// Разделение на стемы: вокал, барабаны, бас и остальное — нейросеть Demucs v4 (Meta)
// в браузере через onnxruntime-web (видеокарта WebGPU, иначе процессор). Обвязка
// модели — порт bakkot/demucs-js (MIT). Свой режим «Дочистка»: маски Винера по миксу,
// подавление просачивания соседних инструментов, полосы и гейт тишины; всё убранное —
// в отдельной дорожке «Остаток». Микшер с соло/выкл, экспорт WAV/MP3 и ZIP. Всё локально.

const SR = 44100;
const MAX_MIN = 15;
const ORDER = ['vocals', 'drums', 'bass', 'other', 'residual'];
const ICON = { vocals: '🎤', drums: '🥁', bass: '🎸', other: '🎹', residual: '🧹' };

const TEXT = {
  ru: {
    drop: 'Загрузите песню — MP3, WAV, FLAC, M4A, OGG', hint: 'Файл не покидает компьютер: нейросеть работает прямо в браузере',
    quality: 'Качество', fast: 'Быстро', best: 'Лучше (×2 дольше)', clean: 'Дочистка стемов', strength: 'Сила дочистки',
    cleanHint: 'Убирает просачивание соседних инструментов и шорох в паузах. Убранное складывается в дорожку «Остаток» — его можно прослушать.',
    run: 'Разделить', cancel: 'Отменить', change: 'Другой файл', play: 'Слушать', stop: 'Стоп', solo: 'Соло', mute: 'Выкл',
    format: 'Формат', zip: 'Скачать всё (ZIP)', minus: 'Минус (без вокала)', download: 'Скачать',
    stage: { model: 'Загрузка нейросети (≈175 МБ, один раз)', split: 'Разделение', clean: 'Дочистка', encode: 'Кодирование' },
    device: { webgpu: 'на видеокарте', wasm: 'на процессоре — это надолго' },
    names: { vocals: 'Вокал', drums: 'Барабаны', bass: 'Бас', other: 'Остальное', residual: 'Остаток (убранный мусор)' },
    long: `Длиннее ${MAX_MIN} минут не получится: не хватит памяти вкладки. Обрежьте трек.`,
    bad: 'Не получилось прочитать файл как аудио.', cancelled: 'Отменено.',
    error: 'Не удалось разделить. Попробуйте Chrome или Edge с поддержкой WebGPU.',
    note: 'Модель Demucs v4 (Meta, Hybrid Transformer). На видеокарте трек в 4 минуты делится примерно за 1–3 минуты, на процессоре — в разы дольше.',
  },
  en: {
    drop: 'Upload a song — MP3, WAV, FLAC, M4A, OGG', hint: 'The file never leaves your computer: the neural net runs right in the browser',
    quality: 'Quality', fast: 'Fast', best: 'Better (×2 slower)', clean: 'Stem cleanup', strength: 'Cleanup strength',
    cleanHint: 'Removes bleed from neighboring instruments and hiss in pauses. Everything removed goes into the “Residual” track so you can listen to it.',
    run: 'Split', cancel: 'Cancel', change: 'Another file', play: 'Play', stop: 'Stop', solo: 'Solo', mute: 'Mute',
    format: 'Format', zip: 'Download all (ZIP)', minus: 'Instrumental (no vocals)', download: 'Download',
    stage: { model: 'Loading the neural net (≈175 MB, once)', split: 'Separating', clean: 'Cleaning up', encode: 'Encoding' },
    device: { webgpu: 'on the GPU', wasm: 'on the CPU — this will take a while' },
    names: { vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Other', residual: 'Residual (removed junk)' },
    long: `Tracks longer than ${MAX_MIN} minutes will not fit in tab memory. Trim the track first.`,
    bad: 'Could not read the file as audio.', cancelled: 'Cancelled.',
    error: 'Separation failed. Try Chrome or Edge with WebGPU support.',
    note: 'Demucs v4 model (Meta, Hybrid Transformer). On a GPU a 4-minute track takes about 1–3 minutes, on a CPU several times longer.',
  },
};

const tfmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function save(data, name, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export default function StemSplitter({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const workerRef = useRef(null);
  const ctxRef = useRef(null);
  const playRef = useRef(null); // { sources, gains, startedAt, offset }
  const [file, setFile] = useState(null); // { name, chans, duration }
  const [quality, setQuality] = useState('fast');
  const [clean, setClean] = useState(true);
  const [strength, setStrength] = useState(50);
  const [busy, setBusy] = useState(null); // { stage, p, device }
  const [stems, setStems] = useState(null); // { name: [L, R] }
  const [mix, setMix] = useState({}); // name → { mute, solo, vol }
  const [playing, setPlaying] = useState(false);
  const [format, setFormat] = useState('wav');
  const [error, setError] = useState('');

  useEffect(() => () => { workerRef.current?.terminate(); stopPlay(); ctxRef.current?.close?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function worker() {
    if (!workerRef.current) workerRef.current = new Worker(new URL('../../workers/stemWorker.js', import.meta.url), { type: 'module' });
    return workerRef.current;
  }

  async function load(f) {
    if (!f) return;
    setError(''); setStems(null); stopPlay();
    try {
      const buf = await new OfflineAudioContext(2, 1, SR).decodeAudioData(await f.arrayBuffer());
      if (buf.duration > MAX_MIN * 60) { setError(t.long); return; }
      const L = buf.getChannelData(0); const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      setFile({ name: f.name.replace(/\.[^.]+$/, ''), chans: [new Float32Array(L), new Float32Array(R)], duration: buf.duration });
    } catch { setError(t.bad); }
  }

  function run() {
    if (!file) return;
    setError(''); setStems(null); stopPlay();
    setBusy({ stage: 'model', p: 0 });
    const w = worker();
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') setBusy((b) => ({ ...b, stage: m.stage, p: m.p, device: m.device || b?.device }));
      if (m.type === 'done') {
        setStems(m.stems); setBusy(null);
        setMix(Object.fromEntries(Object.keys(m.stems).map((k) => [k, { mute: k === 'residual', solo: false, vol: 1 }])));
      }
      if (m.type === 'error') { setBusy(null); setError(m.error === 'cancelled' ? t.cancelled : `${t.error} (${m.error})`); }
    };
    // копии: исходник остаётся у страницы для повторного запуска с другими настройками
    const chans = file.chans.map((c) => new Float32Array(c));
    w.postMessage({ type: 'split', base: new URL(import.meta.env.BASE_URL || '/', window.location.href).href, chans, quality, clean, strength: strength / 100 }, chans.map((c) => c.buffer));
  }

  function cancel() { workerRef.current?.postMessage({ type: 'cancel' }); }

  // --- Микшер ---
  const audible = (k, m = mix) => {
    const anySolo = Object.values(m).some((x) => x.solo);
    return anySolo ? m[k]?.solo : !m[k]?.mute;
  };

  function stopPlay() {
    const p = playRef.current; if (!p) return;
    p.sources.forEach((s) => { try { s.stop(); } catch { /* */ } });
    playRef.current = null; setPlaying(false);
  }

  function play() {
    if (playing) { stopPlay(); return; }
    if (!ctxRef.current) ctxRef.current = new AudioContext({ sampleRate: SR });
    const ctx = ctxRef.current; ctx.resume();
    const gains = {}; const sources = [];
    const at = ctx.currentTime + 0.05;
    Object.entries(stems).forEach(([k, chs]) => {
      const b = ctx.createBuffer(2, chs[0].length, SR); b.copyToChannel(chs[0], 0); b.copyToChannel(chs[1], 1);
      const src = ctx.createBufferSource(); src.buffer = b;
      const g = ctx.createGain(); g.gain.value = audible(k) ? mix[k].vol : 0;
      src.connect(g).connect(ctx.destination); src.start(at); sources.push(src); gains[k] = g;
    });
    sources[0].onended = () => { if (playRef.current?.sources === sources) { playRef.current = null; setPlaying(false); } };
    playRef.current = { sources, gains }; setPlaying(true);
  }

  function setRow(k, patch) {
    setMix((prev) => {
      const next = { ...prev, [k]: { ...prev[k], ...patch } };
      const p = playRef.current;
      if (p) Object.keys(next).forEach((n) => p.gains[n].gain.setTargetAtTime(audible(n, next) ? next[n].vol : 0, ctxRef.current.currentTime, 0.02));
      return next;
    });
  }

  // --- Экспорт ---
  function encode(chans) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2); const w = worker();
      const prev = w.onmessage;
      w.onmessage = (e) => {
        if (e.data.id !== id) { prev?.(e); return; }
        w.onmessage = prev;
        if (e.data.type === 'encoded') resolve(e.data.buffer); else reject(new Error(e.data.error));
      };
      const copy = chans.map((c) => new Float32Array(c));
      w.postMessage({ type: 'encode', id, chans: copy, sr: SR, format }, copy.map((c) => c.buffer));
    });
  }
  const ext = () => (format === 'mp3' ? 'mp3' : 'wav');
  const mime = () => (format === 'mp3' ? 'audio/mpeg' : 'audio/wav');
  const instrumental = () => [0, 1].map((c) => {
    const out = new Float32Array(stems.drums[c].length);
    ['drums', 'bass', 'other'].forEach((k) => { const s = stems[k][c]; for (let i = 0; i < out.length; i += 1) out[i] += s[i]; });
    return out;
  });

  async function downloadOne(k) {
    setBusy({ stage: 'encode', p: 0 });
    try { save(await encode(k === 'minus' ? instrumental() : stems[k]), `${file.name} - ${k === 'minus' ? 'instrumental' : k}.${ext()}`, mime()); } finally { setBusy(null); }
  }

  async function downloadZip() {
    setBusy({ stage: 'encode', p: 0 });
    try {
      const { zipSync } = await import('fflate');
      const files = {}; const keys = [...ORDER.filter((k) => stems[k]), 'minus'];
      for (let i = 0; i < keys.length; i += 1) {
        const k = keys[i];
        files[`${file.name} - ${k === 'minus' ? 'instrumental' : k}.${ext()}`] = new Uint8Array(await encode(k === 'minus' ? instrumental() : stems[k])); // eslint-disable-line no-await-in-loop
        setBusy({ stage: 'encode', p: (i + 1) / keys.length });
      }
      save(zipSync(files, { level: 0 }), `${file.name} - stems.zip`, 'application/zip');
    } finally { setBusy(null); }
  }

  const pct = busy ? Math.round((busy.p || 0) * 100) : 0;

  return (
    <div className="tool-panel stem-splitter">
      {!file ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <p className="ss-file">🎵 <strong>{file.name}</strong> · {tfmt(file.duration)}</p>
          <div className="tool-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.quality}</span>
              <div className="segmented">
                {['fast', 'best'].map((k) => <button key={k} type="button" disabled={!!busy} className={quality === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setQuality(k)}>{t[k]}</button>)}
              </div>
            </div>
            <label className="wm-check" style={{ alignSelf: 'flex-end' }}>
              <input type="checkbox" checked={clean} disabled={!!busy} onChange={(e) => setClean(e.target.checked)} />🧹 {t.clean}
            </label>
            {clean && (
              <label className="tool-field">
                <span className="tool-field-label">{t.strength}: {strength}%</span>
                <input type="range" min="0" max="100" value={strength} disabled={!!busy} onChange={(e) => setStrength(Number(e.target.value))} />
              </label>
            )}
          </div>
          {clean && <p className="tool-local-note">{t.cleanHint}</p>}

          {busy ? (
            <div className="ss-progress">
              <div className="ss-progress-head">
                <span>{t.stage[busy.stage]}{busy.stage === 'split' && busy.device ? ` ${t.device[busy.device]}` : ''}</span>
                <strong>{pct}%</strong>
              </div>
              <div className="ss-bar"><span style={{ width: `${pct}%` }} /></div>
              {busy.stage !== 'encode' && <button type="button" className="tool-btn small ghost" onClick={cancel}>{t.cancel}</button>}
            </div>
          ) : (
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={run}>✂️ {t.run}</button>
              <button type="button" className="tool-btn ghost" onClick={() => { stopPlay(); setFile(null); setStems(null); }}>{t.change}</button>
            </div>
          )}

          {stems && (
            <>
              <div className="ss-mixer">
                {ORDER.filter((k) => stems[k]).map((k) => (
                  <div key={k} className={audible(k) ? 'ss-row' : 'ss-row is-off'}>
                    <span className="ss-name">{ICON[k]} {t.names[k]}</span>
                    <button type="button" className={mix[k]?.solo ? 'tool-btn small is-active' : 'tool-btn small'} onClick={() => setRow(k, { solo: !mix[k].solo })}>{t.solo}</button>
                    <button type="button" className={mix[k]?.mute ? 'tool-btn small is-active' : 'tool-btn small'} onClick={() => setRow(k, { mute: !mix[k].mute })}>{t.mute}</button>
                    <input type="range" min="0" max="1.5" step="0.01" value={mix[k]?.vol ?? 1} aria-label={t.names[k]} onChange={(e) => setRow(k, { vol: Number(e.target.value) })} />
                    <button type="button" className="tool-btn small" disabled={!!busy} onClick={() => downloadOne(k)}>⬇ {t.download}</button>
                  </div>
                ))}
              </div>
              <div className="tool-actions">
                <button type="button" className="tool-btn primary" onClick={play}>{playing ? `⏹ ${t.stop}` : `▶ ${t.play}`}</button>
                <div className="segmented">
                  {[['wav', 'WAV'], ['mp3', 'MP3']].map(([k, l]) => <button key={k} type="button" className={format === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFormat(k)}>{l}</button>)}
                </div>
                <button type="button" className="tool-btn" disabled={!!busy} onClick={() => downloadOne('minus')}>🎼 {t.minus}</button>
                <button type="button" className="tool-btn" disabled={!!busy} onClick={downloadZip}>📦 {t.zip}</button>
              </div>
            </>
          )}
        </>
      )}
      {error && <p className="color-invalid">{error}</p>}
      <input ref={inputRef} type="file" accept="audio/*,.flac,.m4a,.ogg,.opus" hidden onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note} {aiBrowserHint(language)}</p>
    </div>
  );
}
