import { useEffect, useRef, useState } from 'react';
import { decodeAudioFile, downloadBlob, encodeMp3, encodeWAV, getAudioCtx } from '../../utils/wav';
import { getPeaks } from '../../utils/audioPeaks';

// Удаление тишины: находит паузы тише порога дольше заданной длины и вырезает их
// (или укорачивает до N мс — речь остаётся естественной). Переходы сшиваются
// короткими кроссфейдами без щелчков. Волна с подсветкой пауз, экспорт WAV/MP3.

const TEXT = {
  ru: {
    drop: 'Загрузите аудио — подкаст, голосовое, лекцию', hint: 'MP3, WAV, M4A, OGG — всё локально', threshold: 'Порог тишины', minDur: 'Паузы длиннее', keep: 'Оставлять от паузы',
    result: (a, b, n) => `Было ${a} → стало ${b} · вырезано пауз: ${n}`, play: 'Прослушать результат', stop: 'Стоп', wav: 'Скачать WAV', mp3: 'Скачать MP3', change: 'Другой файл', auto: 'Подобрать порог',
    note: 'Паузы подсвечены красным. Для речи хорошо работает «оставлять 150–250 мс» — темп ускоряется, а речь не звучит рубленой.',
  },
  en: {
    drop: 'Upload audio — a podcast, voice note, lecture', hint: 'MP3, WAV, M4A, OGG — all local', threshold: 'Silence threshold', minDur: 'Pauses longer than', keep: 'Keep of each pause',
    result: (a, b, n) => `Was ${a} → now ${b} · pauses cut: ${n}`, play: 'Preview result', stop: 'Stop', wav: 'Download WAV', mp3: 'Download MP3', change: 'Another file', auto: 'Auto threshold',
    note: 'Pauses are highlighted in red. For speech, “keep 150–250 ms” works well — the pace picks up without sounding choppy.',
  },
};

const tfmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const WIN = 0.02; // окно анализа 20 мс

function analyze(buf, thrDb, minDur) {
  const sr = buf.sampleRate; const n = Math.floor(buf.length / (sr * WIN));
  const chans = []; for (let c = 0; c < buf.numberOfChannels; c += 1) chans.push(buf.getChannelData(c));
  const db = new Float32Array(n); const size = Math.floor(sr * WIN);
  for (let w = 0; w < n; w += 1) {
    let s = 0; for (const d of chans) for (let i = w * size; i < (w + 1) * size; i += 1) s += d[i] * d[i];
    db[w] = 10 * Math.log10(s / (size * chans.length) + 1e-12);
  }
  const silences = []; let start = -1;
  for (let w = 0; w <= n; w += 1) {
    const quiet = w < n && db[w] < thrDb;
    if (quiet && start < 0) start = w;
    if (!quiet && start >= 0) { if ((w - start) * WIN >= minDur) silences.push([start * WIN, w * WIN]); start = -1; }
  }
  return { silences, db };
}

function buildOutput(buf, silences, keepSec) {
  const sr = buf.sampleRate; const xf = Math.floor(sr * 0.008);
  const keepS = Math.floor(keepSec * sr);
  // Сегменты для сохранения: всё, кроме середины пауз (оставляем keep/2 с каждого края).
  const segs = []; let cur = 0;
  silences.forEach(([a, b]) => {
    const A = Math.floor(a * sr); const B = Math.floor(b * sr);
    const cutA = A + Math.floor(keepS / 2); const cutB = B - Math.ceil(keepS / 2);
    if (cutB > cutA) { segs.push([cur, cutA]); cur = cutB; }
  });
  segs.push([cur, buf.length]);
  const total = segs.reduce((s, [a, b]) => s + (b - a), 0);
  const out = getAudioCtx().createBuffer(buf.numberOfChannels, Math.max(1, total), sr);
  for (let c = 0; c < buf.numberOfChannels; c += 1) {
    const src = buf.getChannelData(c); const dst = out.getChannelData(c); let o = 0;
    segs.forEach(([a, b], k) => {
      for (let i = a; i < b; i += 1) {
        let v = src[i];
        // Микро-фейды на стыках — без щелчков.
        if (k > 0 && i - a < xf) v *= (i - a) / xf;
        if (k < segs.length - 1 && b - i < xf) v *= (b - i) / xf;
        dst[o] = v; o += 1;
      }
    });
  }
  return out;
}

function SilenceRemover({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null); const canvasRef = useRef(null); const srcRef = useRef(null);
  const [buf, setBuf] = useState(null);
  const [name, setName] = useState('audio');
  const [thr, setThr] = useState(-42);
  const [minDur, setMinDur] = useState(0.4);
  const [keep, setKeep] = useState(0.2);
  const [res, setRes] = useState(null);
  const [playing, setPlaying] = useState(false);

  async function load(f) {
    if (!f) return;
    setName(f.name.replace(/\.[^.]+$/, ''));
    const b = await decodeAudioFile(f); setBuf(b);
  }

  // Порог: 15-й перцентиль громкости окон + 6 дБ (ниже речи, выше фона).
  function autoThreshold() {
    const { db } = analyze(buf, -200, 99);
    const sorted = [...db].filter(Number.isFinite).sort((a, b) => a - b);
    setThr(Math.round(Math.max(-70, Math.min(-20, sorted[Math.floor(sorted.length * 0.15)] + 6))));
  }

  useEffect(() => {
    if (!buf) return;
    const { silences } = analyze(buf, thr, minDur);
    const out = buildOutput(buf, silences, keep);
    setRes({ silences, out });
    const c = canvasRef.current; if (!c) return;
    const W = c.clientWidth || 900; const H = 140; c.width = W * 2; c.height = H * 2;
    const x = c.getContext('2d'); x.scale(2, 2); x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,80,110,0.22)';
    silences.forEach(([a, b]) => x.fillRect((a / buf.duration) * W, 0, ((b - a) / buf.duration) * W, H));
    const peaks = getPeaks(buf); const per = peaks.max.length / W;
    x.fillStyle = '#7e83ff';
    for (let px = 0; px < W; px += 1) {
      let mn = 0; let mx = 0;
      for (let k = Math.floor(px * per); k < Math.floor((px + 1) * per); k += 1) { mn = Math.min(mn, peaks.min[k]); mx = Math.max(mx, peaks.max[k]); }
      x.fillRect(px, H / 2 - mx * (H / 2 - 4), 1, Math.max(1, (mx - mn) * (H / 2 - 4)));
    }
    const lvl = 10 ** (thr / 20); x.strokeStyle = 'rgba(255,200,43,0.8)'; x.setLineDash([4, 4]);
    x.beginPath(); x.moveTo(0, H / 2 - lvl * (H / 2 - 4)); x.lineTo(W, H / 2 - lvl * (H / 2 - 4)); x.stroke();
  }, [buf, thr, minDur, keep]);

  function play() {
    if (playing) { srcRef.current?.stop(); setPlaying(false); return; }
    const s = getAudioCtx().createBufferSource(); s.buffer = res.out; s.connect(getAudioCtx().destination);
    s.onended = () => setPlaying(false); s.start(); srcRef.current = s; setPlaying(true);
  }

  return (
    <div className="tool-panel silence-remover">
      {!buf ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <canvas ref={canvasRef} className="sr-wave" />
          {res && <p className="sr-res">{t.result(tfmt(buf.duration), tfmt(res.out.duration), res.silences.length)}</p>}
          <div className="tool-controls">
            <label className="tool-field"><span className="tool-field-label">{t.threshold}: {thr} dB</span><input type="range" min="-70" max="-15" value={thr} onChange={(e) => setThr(Number(e.target.value))} /></label>
            <button type="button" className="tool-btn small" onClick={autoThreshold}>✨ {t.auto}</button>
            <label className="tool-field"><span className="tool-field-label">{t.minDur}: {minDur.toFixed(2)} s</span><input type="range" min="0.1" max="3" step="0.05" value={minDur} onChange={(e) => setMinDur(Number(e.target.value))} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.keep}: {Math.round(keep * 1000)} ms</span><input type="range" min="0" max="1" step="0.01" value={keep} onChange={(e) => setKeep(Number(e.target.value))} /></label>
          </div>
          <div className="tool-actions">
            <button type="button" className="tool-btn" onClick={play} disabled={!res}>{playing ? `⏹ ${t.stop}` : `▶ ${t.play}`}</button>
            <button type="button" className="tool-btn primary" onClick={async () => downloadBlob(await encodeMp3(res.out, 192), `${name}-nosilence.mp3`)} disabled={!res}>{t.mp3}</button>
            <button type="button" className="tool-btn" onClick={() => downloadBlob(encodeWAV(res.out), `${name}-nosilence.wav`)} disabled={!res}>{t.wav}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}
      <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default SilenceRemover;
