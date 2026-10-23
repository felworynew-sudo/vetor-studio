import { useEffect, useRef, useState } from 'react';
import { AUDIO_FORMATS, ffmpegRun } from '../../utils/ffmpeg';
import { encodeWAV } from '../../utils/wav';
import { decodeNative, encodeLike, outputName, probeAudio } from '../../utils/audioFormat';
import FormatPicker from './shared/FormatPicker';

// Обрезка аудио: загрузка → волновая форма → выбор фрагмента ручками → экспорт с
// фейдами в WAV/MP3 (локально) или FLAC/AAC/Opus/OGG и рингтон iPhone M4R (FFmpeg).

const TEXT = {
  ru: {
    drop: 'Загрузите аудио', hint: 'MP3, WAV, M4A, OGG — обрабатывается локально',
    play: 'Прослушать фрагмент', stop: 'Стоп', fade: 'Фейд (сек)', trim: 'Обрезать и скачать', format: 'Формат', saving: 'Кодирую…', ringtone: 'Рингтон iPhone (M4R)', ringNote: 'Рингтон iPhone — не длиннее 40 секунд.',
    change: 'Другой файл', from: 'Начало', to: 'Конец', dur: 'Длина', decoding: 'Читаю аудио…',
    hint2: 'Тяните ручки по краям выделения. Файл сохраняется в исходном формате (или выберите другой). WAV и MP3 кодируются сразу, остальные форматы — через FFmpeg (≈30 МБ, один раз).',
  },
  en: {
    drop: 'Upload audio', hint: 'MP3, WAV, M4A, OGG — processed locally',
    play: 'Preview selection', stop: 'Stop', fade: 'Fade (sec)', trim: 'Trim & download', format: 'Format', saving: 'Encoding…', ringtone: 'iPhone ringtone (M4R)', ringNote: 'An iPhone ringtone must be 40 seconds or shorter.',
    change: 'Another file', from: 'Start', to: 'End', dur: 'Length', decoding: 'Reading audio…',
    hint2: 'Drag the handles at the edges. The file is saved in its source format (or pick another). WAV and MP3 encode instantly, other formats go through FFmpeg (≈30 MB, once).',
  },
};

function fmtTime(s) {
  const m = Math.floor(s / 60); const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
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
  const [outFmt, setOutFmt] = useState('source');
  const [probe, setProbe] = useState(null);
  const fileNameRef = useRef('audio');
  const [saving, setSaving] = useState(false);

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
      const info = await probeAudio(file); setProbe(info); fileNameRef.current = file.name;
      const buf = await decodeNative(file, info, getCtx());
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

  async function trim() {
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
    setSaving(true);
    try {
      let blob; let ext;
      if (outFmt === 'm4r') {
        // рингтон iPhone: AAC в контейнере m4a с тегом ipod
        const wav = encodeWAV(out); const f = AUDIO_FORMATS.aac;
        const data = await ffmpegRun(new File([wav], 'trim.wav', { type: 'audio/wav' }), [...f.args(f.bitrates[2]), '-f', 'ipod'], 'out.m4a');
        blob = new Blob([data], { type: f.mime }); ext = 'm4r';
      } else {
        const r = await encodeLike(out, { ...probe, size: 0 }, { target: outFmt }); blob = r.blob; ext = r.ext;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = outputName(fileNameRef.current, 'trim', ext);
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } catch (e) { console.error(e); }
    setSaving(false);
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
            <FormatPicker probe={probe} value={outFmt} onChange={setOutFmt} language={language} label={t.format} extra={<button type="button" className={outFmt === 'm4r' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setOutFmt('m4r')}>{t.ringtone}</button>} />
            <div className="tool-field">
              <span className="tool-field-label">{t.fade}: {fade.toFixed(2)}</span>
              <input type="range" min="0" max="1" step="0.01" value={fade} onChange={(e) => setFade(Number(e.target.value))} />
            </div>
          </div>
          {outFmt === 'm4r' && endT - startT > 40 && <p className="color-invalid">{t.ringNote}</p>}
          <div className="tool-actions">
            <button type="button" className="tool-btn" onClick={() => (playing ? stop() : play())}>{playing ? `⏹ ${t.stop}` : `▶ ${t.play}`}</button>
            <button type="button" className="tool-btn primary" onClick={trim} disabled={saving || (outFmt === 'm4r' && endT - startT > 40)}>{saving ? t.saving : t.trim}</button>
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
