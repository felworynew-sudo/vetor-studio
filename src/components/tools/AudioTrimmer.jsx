import { useEffect, useRef, useState } from 'react';

// Обрезка аудио: загрузка → волновая форма → выбор фрагмента ручками → экспорт
// WAV с фейдами. Локально через Web Audio.

const TEXT = {
  ru: {
    drop: 'Загрузите аудио', hint: 'MP3, WAV, M4A, OGG — обрабатывается локально',
    play: 'Прослушать фрагмент', stop: 'Стоп', fade: 'Фейд (сек)', trim: 'Обрезать и скачать WAV',
    change: 'Другой файл', from: 'Начало', to: 'Конец', dur: 'Длина', decoding: 'Читаю аудио…',
    hint2: 'Тяните ручки по краям выделения. Экспорт — WAV без потерь.',
  },
  en: {
    drop: 'Upload audio', hint: 'MP3, WAV, M4A, OGG — processed locally',
    play: 'Preview selection', stop: 'Stop', fade: 'Fade (sec)', trim: 'Trim & download WAV',
    change: 'Another file', from: 'Start', to: 'End', dur: 'Length', decoding: 'Reading audio…',
    hint2: 'Drag the handles at the edges. Export is lossless WAV.',
  },
};

function fmtTime(s) {
  const m = Math.floor(s / 60); const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

function encodeWAV(buffer) {
  const nc = buffer.numberOfChannels; const sr = buffer.sampleRate; const len = buffer.length;
  const dataSize = len * nc * 2; const ab = new ArrayBuffer(44 + dataSize); const dv = new DataView(ab);
  let p = 0;
  const wS = (s) => { for (let i = 0; i < s.length; i += 1) { dv.setUint8(p, s.charCodeAt(i)); p += 1; } };
  const w32 = (v) => { dv.setUint32(p, v, true); p += 4; }; const w16 = (v) => { dv.setUint16(p, v, true); p += 2; };
  wS('RIFF'); w32(36 + dataSize); wS('WAVE'); wS('fmt '); w32(16); w16(1); w16(nc); w32(sr); w32(sr * nc * 2); w16(nc * 2); w16(16); wS('data'); w32(dataSize);
  const ch = []; for (let c = 0; c < nc; c += 1) ch.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i += 1) for (let c = 0; c < nc; c += 1) { const s = Math.max(-1, Math.min(1, ch[c][i])); dv.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true); p += 2; }
  return new Blob([ab], { type: 'audio/wav' });
}

let ctx = null;
function getCtx() { if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; ctx = new C(); } return ctx; }

function AudioTrimmer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const bufferRef = useRef(null);
  const srcRef = useRef(null);
  const dragRef = useRef(null);
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(0);
  const [sel, setSel] = useState({ a: 0, b: 1 }); // доли
  const [fade, setFade] = useState(0.05);
  const [playing, setPlaying] = useState(false);
  const [decoding, setDecoding] = useState(false);

  function drawWave() {
    const canvas = canvasRef.current; const buf = bufferRef.current;
    if (!canvas || !buf) return;
    const w = canvas.width = canvas.clientWidth * 2; const h = canvas.height = 240;
    const ctx2 = canvas.getContext('2d');
    ctx2.clearRect(0, 0, w, h);
    const data = buf.getChannelData(0);
    const step = Math.floor(data.length / w) || 1;
    ctx2.fillStyle = '#3a3d52';
    for (let x = 0; x < w; x += 1) {
      let min = 1; let max = -1;
      for (let j = 0; j < step; j += 1) { const v = data[x * step + j] || 0; if (v < min) min = v; if (v > max) max = v; }
      const y1 = (1 + min) * h / 2; const y2 = (1 + max) * h / 2;
      ctx2.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
    // выделение
    ctx2.fillStyle = 'rgba(97,102,255,0.18)';
    ctx2.fillRect(sel.a * w, 0, (sel.b - sel.a) * w, h);
    ctx2.fillStyle = '#6166ff';
    ctx2.fillRect(sel.a * w - 1, 0, 3, h); ctx2.fillRect(sel.b * w - 1, 0, 3, h);
  }

  useEffect(() => { drawWave(); }, [sel, duration]);

  async function loadFile(file) {
    if (!file) return;
    setDecoding(true);
    try {
      const ab = await file.arrayBuffer();
      const buf = await getCtx().decodeAudioData(ab.slice(0));
      bufferRef.current = buf; setName(file.name); setDuration(buf.duration); setSel({ a: 0, b: 1 });
    } catch { /* */ }
    setDecoding(false);
  }

  function pointerFrac(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }
  function onDown(e) {
    const f = pointerFrac(e);
    dragRef.current = Math.abs(f - sel.a) < Math.abs(f - sel.b) ? 'a' : 'b';
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onMove(e);
  }
  function onMove(e) {
    if (!dragRef.current) return;
    const f = pointerFrac(e);
    setSel((s) => {
      if (dragRef.current === 'a') return { a: Math.min(f, s.b - 0.005), b: s.b };
      return { a: s.a, b: Math.max(f, s.a + 0.005) };
    });
  }
  function onUp() { dragRef.current = null; }

  function stop() { if (srcRef.current) { try { srcRef.current.stop(); } catch { /* */ } srcRef.current = null; } setPlaying(false); }
  function play() {
    stop();
    const buf = bufferRef.current; if (!buf) return;
    const c = getCtx(); if (c.state === 'suspended') c.resume();
    const src = c.createBufferSource(); src.buffer = buf;
    src.connect(c.destination);
    const start = sel.a * buf.duration; const dur = (sel.b - sel.a) * buf.duration;
    src.start(0, start, dur);
    src.onended = () => setPlaying(false);
    srcRef.current = src; setPlaying(true);
  }

  function trim() {
    const buf = bufferRef.current; if (!buf) return;
    const sr = buf.sampleRate;
    const startS = Math.floor(sel.a * buf.length); const endS = Math.floor(sel.b * buf.length);
    const len = Math.max(1, endS - startS);
    const out = getCtx().createBuffer(buf.numberOfChannels, len, sr);
    const fadeS = Math.min(Math.floor(fade * sr), Math.floor(len / 2));
    for (let ch = 0; ch < buf.numberOfChannels; ch += 1) {
      const src = buf.getChannelData(ch); const dst = out.getChannelData(ch);
      for (let i = 0; i < len; i += 1) {
        let v = src[startS + i] || 0;
        if (i < fadeS) v *= i / fadeS;
        else if (i > len - fadeS) v *= (len - i) / fadeS;
        dst[i] = v;
      }
    }
    const blob = encodeWAV(out);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${name.replace(/\.[^.]+$/, '')}-trim.wav`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  const startT = sel.a * duration; const endT = sel.b * duration;

  return (
    <div className="tool-panel audio-trimmer">
      {!bufferRef.current ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{decoding ? t.decoding : t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            className="at-wave"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          />
          <div className="at-times">
            <span>{t.from}: <strong>{fmtTime(startT)}</strong></span>
            <span>{t.to}: <strong>{fmtTime(endT)}</strong></span>
            <span>{t.dur}: <strong>{fmtTime(endT - startT)}</strong></span>
          </div>
          <div className="tool-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.fade}: {fade.toFixed(2)}</span>
              <input type="range" min="0" max="1" step="0.01" value={fade} onChange={(e) => setFade(Number(e.target.value))} />
            </div>
          </div>
          <div className="tool-actions">
            <button type="button" className="tool-btn" onClick={() => (playing ? stop() : play())}>{playing ? `⏹ ${t.stop}` : `▶ ${t.play}`}</button>
            <button type="button" className="tool-btn primary" onClick={trim}>{t.trim}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}
      <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.hint2}</p>
    </div>
  );
}

export default AudioTrimmer;
