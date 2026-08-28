import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeAudioFile, encodeWAV, encodeMp3, getAudioCtx, downloadBlob } from '../../utils/wav';
import { takeAudioHandoff } from '../../utils/audioHandoff';

// Многодорожечный аудио-редактор. Импорт нескольких файлов → дорожки на общей
// таймлинии: тащишь клип по времени, режешь ручками, у каждой дорожки громкость/
// панорама/mute/solo/фейды/3-полосный EQ. Транспорт с плейхедом, скоростью, зумом.
// Микс сводится в WAV/MP3 через OfflineAudioContext. Всё локально в браузере.
//
// Скорость меняет и темп, и тон (playbackRate) — честно, независимый питч-шифт
// (фазовый вокодер) вынесён на будущее.

const ROW_H = 92;
const RULER_H = 26;
const TRACK_COLORS = ['#6166ff', '#ff5c63', '#3ec98a', '#f5c84c', '#75d0ff', '#b277ff', '#ff8a3d', '#ff5cb0'];

const TEXT = {
  ru: {
    drop: 'Перетащите аудио или нажмите — можно несколько файлов',
    hint: 'WAV, MP3, OGG, FLAC, M4A — всё обрабатывается локально',
    add: 'Добавить дорожки', play: 'Играть', stop: 'Стоп', master: 'Общая', speed: 'Скорость', zoom: 'Масштаб',
    exportWav: 'Свести в WAV', exportMp3: 'Свести в MP3', rendering: 'Свожу…',
    vol: 'Громкость', pan: 'Панорама', mute: 'Тихо', solo: 'Соло', remove: 'Удалить дорожку',
    fadeIn: 'Фейд ↗', fadeOut: 'Фейд ↘', eq: 'Эквалайзер', low: 'Низ', mid: 'Середина', high: 'Верх',
    empty: 'Добавьте хотя бы одну дорожку, чтобы свести микс.',
    note: 'Скорость меняет и темп, и тон. Всё считается локально — файлы не уходят на сервер.',
    tracks: 'дорожек', decoding: 'Декодирую…',
  },
  en: {
    drop: 'Drop audio or click — several files at once are fine',
    hint: 'WAV, MP3, OGG, FLAC, M4A — all processed locally',
    add: 'Add tracks', play: 'Play', stop: 'Stop', master: 'Master', speed: 'Speed', zoom: 'Zoom',
    exportWav: 'Mix to WAV', exportMp3: 'Mix to MP3', rendering: 'Mixing…',
    vol: 'Volume', pan: 'Pan', mute: 'Mute', solo: 'Solo', remove: 'Remove track',
    fadeIn: 'Fade ↗', fadeOut: 'Fade ↘', eq: 'Equalizer', low: 'Low', mid: 'Mid', high: 'High',
    empty: 'Add at least one track to mix down.',
    note: 'Speed changes both tempo and pitch. Everything runs locally — files never leave your device.',
    tracks: 'tracks', decoding: 'Decoding…',
  },
};

const fmt = (s) => {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
let uid = 0;

// Дорожка из готового AudioBuffer (общий конструктор для файлов и передачи из диктофона).
function makeTrack(buffer, name) {
  uid += 1;
  return {
    id: uid, name, buffer, offset: 0, trimStart: 0, trimEnd: buffer.duration,
    gain: 1, pan: 0, muted: false, solo: false, fadeIn: 0, fadeOut: 0,
    eq: { low: 0, mid: 0, high: 0 }, color: TRACK_COLORS[(uid - 1) % TRACK_COLORS.length],
  };
}

// Собирает цепочку одной дорожки в переданном контексте (live или offline) и
// планирует запуск. base — момент аудио-времени, соответствующий playheadSec.
function scheduleTrack(ctx, tk, master, base, playheadSec, rate, soloActive) {
  const clipLen = tk.trimEnd - tk.trimStart; // секунды буфера
  if (clipLen <= 0) return null;
  const projEnd = tk.offset + clipLen; // проектное время конца клипа (при rate=1)
  if (projEnd <= playheadSec) return null; // клип уже позади плейхеда
  const audible = (!soloActive || tk.solo) && !tk.muted;
  const into = Math.max(0, playheadSec - tk.offset); // на сколько плейхед внутри клипа
  const bufStart = tk.trimStart + into;
  const dur = tk.trimEnd - bufStart; // сколько буфера осталось играть
  if (dur <= 0) return null;
  const projStart = Math.max(tk.offset, playheadSec);
  const when = base + (projStart - playheadSec) / rate;
  const playDurAudio = dur / rate;

  const src = ctx.createBufferSource();
  src.buffer = tk.buffer;
  src.playbackRate.value = rate;

  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 250; low.gain.value = tk.eq.low;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = 0.9; mid.gain.value = tk.eq.mid;
  const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4000; high.gain.value = tk.eq.high;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) pan.pan.value = tk.pan;
  const g = ctx.createGain();

  const baseGain = audible ? tk.gain : 0;
  const fadeInAudio = Math.max(0, tk.fadeIn) / rate;
  const fadeOutAudio = Math.max(0, tk.fadeOut) / rate;
  g.gain.setValueAtTime(baseGain, when);
  if (audible && fadeInAudio > 0 && into < tk.fadeIn) {
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(baseGain, when + fadeInAudio);
  }
  if (audible && fadeOutAudio > 0) {
    const foStart = when + Math.max(0, playDurAudio - fadeOutAudio);
    g.gain.setValueAtTime(baseGain, foStart);
    g.gain.linearRampToValueAtTime(0, when + playDurAudio);
  }

  src.connect(low); low.connect(mid); mid.connect(high);
  if (pan) { high.connect(pan); pan.connect(g); } else { high.connect(g); }
  g.connect(master);
  src.start(when, bufStart, dur);
  return src;
}

function MultitrackEditor({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const laneWrapRef = useRef(null);
  const canvasRefs = useRef({});
  const sourcesRef = useRef([]);
  const rafRef = useRef(0);
  const dragRef = useRef(null);
  const playStateRef = useRef(null); // { base, startPlayhead, rate }

  const [tracks, setTracks] = useState([]);
  const [pxPerSec, setPxPerSec] = useState(60);
  const [master, setMaster] = useState(1);
  const [rate, setRate] = useState(1);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState('');
  const [mp3kbps, setMp3kbps] = useState(192);

  // Приём записи из диктофона (кнопка «В аудио-редактор») — добавляем дорожкой.
  useEffect(() => {
    const h = takeAudioHandoff();
    if (h && h.buffer) setTracks((prev) => [...prev, makeTrack(h.buffer, h.name || 'audio')]);
  }, []);

  const soloActive = tracks.some((tk) => tk.solo);
  const totalDur = tracks.reduce((m, tk) => Math.max(m, tk.offset + (tk.trimEnd - tk.trimStart)), 0);

  // --- загрузка файлов ---
  const addFiles = useCallback(async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(f.name));
    if (!list.length) return;
    setBusy(t.decoding);
    for (const file of list) {
      try {
        const buffer = await decodeAudioFile(file); // eslint-disable-line no-await-in-loop
        setTracks((prev) => [...prev, makeTrack(buffer, file.name.replace(/\.[^.]+$/, ''))]);
      } catch { /* пропускаем нечитаемый файл */ }
    }
    setBusy('');
  }, [t.decoding]);

  const patch = (id, upd) => setTracks((prev) => prev.map((tk) => (tk.id === id ? { ...tk, ...(typeof upd === 'function' ? upd(tk) : upd) } : tk)));
  const removeTrack = (id) => { setTracks((prev) => prev.filter((tk) => tk.id !== id)); delete canvasRefs.current[id]; };

  // --- отрисовка волн ---
  const drawLane = useCallback((tk) => {
    const canvas = canvasRefs.current[tk.id];
    if (!canvas) return;
    const clipLen = tk.trimEnd - tk.trimStart;
    const w = Math.max(1, Math.round(clipLen * pxPerSec));
    const h = ROW_H - 16;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const data = tk.buffer.getChannelData(0);
    const sr = tk.buffer.sampleRate;
    const startSample = Math.floor(tk.trimStart * sr);
    const totalSamples = Math.floor(clipLen * sr);
    const step = Math.max(1, Math.floor(totalSamples / w));
    ctx.fillStyle = tk.color;
    const mid = h / 2;
    for (let x = 0; x < w; x += 1) {
      let min = 1; let max = -1;
      const s0 = startSample + Math.floor((x / w) * totalSamples);
      for (let i = 0; i < step; i += 1) { const v = data[s0 + i] || 0; if (v < min) min = v; if (v > max) max = v; }
      const y1 = mid + min * (mid - 2); const y2 = mid + max * (mid - 2);
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
    // фейды — диагонали
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
    if (tk.fadeIn > 0) { ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(clamp(tk.fadeIn * pxPerSec, 0, w), 0); ctx.stroke(); }
    if (tk.fadeOut > 0) { ctx.beginPath(); ctx.moveTo(w, h); ctx.lineTo(w - clamp(tk.fadeOut * pxPerSec, 0, w), 0); ctx.stroke(); }
  }, [pxPerSec]);

  useEffect(() => { tracks.forEach(drawLane); }, [tracks, pxPerSec, drawLane]);

  // --- перетаскивание / тримминг клипа ---
  function startDrag(e, tk, mode) {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { id: tk.id, mode, startX: e.clientX, offset: tk.offset, trimStart: tk.trimStart, trimEnd: tk.trimEnd };
    window.addEventListener('pointermove', onDrag);
    window.addEventListener('pointerup', endDrag);
  }
  function onDrag(e) {
    const d = dragRef.current; if (!d) return;
    const ds = (e.clientX - d.startX) / pxPerSec;
    setTracks((prev) => prev.map((tk) => {
      if (tk.id !== d.id) return tk;
      const dur = tk.buffer.duration;
      if (d.mode === 'move') return { ...tk, offset: Math.max(0, d.offset + ds) };
      if (d.mode === 'trimL') return { ...tk, trimStart: clamp(d.trimStart + ds, 0, tk.trimEnd - 0.05) };
      if (d.mode === 'trimR') return { ...tk, trimEnd: clamp(d.trimEnd + ds, tk.trimStart + 0.05, dur) };
      return tk;
    }));
  }
  function endDrag() {
    dragRef.current = null;
    window.removeEventListener('pointermove', onDrag);
    window.removeEventListener('pointerup', endDrag);
  }

  // --- транспорт ---
  const stop = useCallback(() => {
    sourcesRef.current.forEach((s) => { try { s.stop(); } catch { /* уже остановлен */ } });
    sourcesRef.current = [];
    cancelAnimationFrame(rafRef.current);
    playStateRef.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback((from) => {
    if (!tracks.length) return;
    stop();
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const startPlayhead = from != null ? from : playhead;
    if (startPlayhead >= totalDur) return;
    const base = ctx.currentTime + 0.06;
    const masterGain = ctx.createGain(); masterGain.gain.value = master; masterGain.connect(ctx.destination);
    const srcs = [];
    tracks.forEach((tk) => { const s = scheduleTrack(ctx, tk, masterGain, base, startPlayhead, rate, soloActive); if (s) srcs.push(s); });
    sourcesRef.current = srcs;
    playStateRef.current = { base, startPlayhead, rate };
    setPlaying(true);
    const tick = () => {
      const st = playStateRef.current; if (!st) return;
      const pos = st.startPlayhead + (ctx.currentTime - st.base) * st.rate;
      if (pos >= totalDur) { setPlayhead(totalDur); stop(); return; }
      setPlayhead(Math.max(0, pos));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [tracks, playhead, totalDur, master, rate, soloActive, stop]);

  // держим громкость/темп живого мастера в актуальном состоянии не нужно — пересобираем при play.
  useEffect(() => () => stop(), [stop]);

  function seek(e) {
    const wrap = laneWrapRef.current; if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left + wrap.scrollLeft;
    const pos = clamp(x / pxPerSec, 0, totalDur);
    setPlayhead(pos);
    if (playing) play(pos);
  }

  // --- сведение (offline) ---
  async function exportMix(kind) {
    if (!tracks.length || busy) return;
    stop();
    setBusy(t.rendering);
    try {
      const sr = 44100;
      const len = Math.ceil((totalDur / rate + 0.2) * sr);
      const octx = new OfflineAudioContext(2, len, sr);
      const masterGain = octx.createGain(); masterGain.gain.value = master; masterGain.connect(octx.destination);
      tracks.forEach((tk) => scheduleTrack(octx, tk, masterGain, 0, 0, rate, soloActive));
      const rendered = await octx.startRendering();
      const blob = kind === 'mp3' ? await encodeMp3(rendered, mp3kbps) : encodeWAV(rendered);
      downloadBlob(blob, `mix-${Math.round(totalDur)}s.${kind}`);
    } catch { /* тихо */ }
    setBusy('');
  }

  const innerW = Math.max(360, Math.ceil(totalDur * pxPerSec) + 40);

  return (
    <div className="tool-panel mt">
      {tracks.length === 0 ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
          <span className="tool-dropzone-title">{busy || t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="mt-transport">
            <button type="button" className={playing ? 'tool-btn' : 'tool-btn primary'} onClick={() => (playing ? stop() : play())}>
              {playing ? `■ ${t.stop}` : `▶ ${t.play}`}
            </button>
            <span className="mt-time num">{fmt(playhead)} / {fmt(totalDur)}</span>
            <label className="mt-knob"><span>{t.master}</span>
              <input type="range" min="0" max="1.5" step="0.01" value={master} onChange={(e) => setMaster(Number(e.target.value))} /></label>
            <label className="mt-knob"><span>{t.speed} ×{rate.toFixed(2)}</span>
              <input type="range" min="0.5" max="2" step="0.05" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></label>
            <label className="mt-knob"><span>{t.zoom}</span>
              <input type="range" min="20" max="200" step="5" value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} /></label>
            <div className="mt-transport-spacer" />
            <button type="button" className="tool-btn small" onClick={() => inputRef.current?.click()}>+ {t.add}</button>
            <button type="button" className="tool-btn" disabled={!!busy} onClick={() => exportMix('wav')}>{busy || t.exportWav}</button>
            <div className="segmented mt-kbps" title="MP3 kbps">
              {[128, 192, 320].map((b) => (
                <button key={b} type="button" className={mp3kbps === b ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMp3kbps(b)}>{b}</button>
              ))}
            </div>
            <button type="button" className="tool-btn" disabled={!!busy} onClick={() => exportMix('mp3')}>{t.exportMp3}</button>
          </div>

          <div className="mt-body">
            <div className="mt-controls" style={{ paddingTop: RULER_H }}>
              {tracks.map((tk) => (
                <div className="mt-ctrl" key={tk.id} style={{ height: ROW_H }}>
                  <div className="mt-ctrl-head">
                    <span className="mt-dot" style={{ background: tk.color }} />
                    <span className="mt-name" title={tk.name}>{tk.name}</span>
                    <button type="button" className="mt-x" onClick={() => removeTrack(tk.id)} title={t.remove}>✕</button>
                  </div>
                  <div className="mt-ctrl-row">
                    <button type="button" className={tk.muted ? 'mt-tag is-on' : 'mt-tag'} onClick={() => patch(tk.id, (p) => ({ muted: !p.muted }))}>{t.mute}</button>
                    <button type="button" className={tk.solo ? 'mt-tag is-solo' : 'mt-tag'} onClick={() => patch(tk.id, (p) => ({ solo: !p.solo }))}>{t.solo}</button>
                    <input className="mt-mini" type="range" min="0" max="1.5" step="0.01" value={tk.gain} title={t.vol}
                      onChange={(e) => patch(tk.id, { gain: Number(e.target.value) })} />
                    <input className="mt-mini" type="range" min="-1" max="1" step="0.02" value={tk.pan} title={t.pan}
                      onChange={(e) => patch(tk.id, { pan: Number(e.target.value) })} />
                  </div>
                  <div className="mt-ctrl-row mt-eq">
                    <label title={`${t.fadeIn} (${tk.fadeIn.toFixed(1)}s)`}>↗<input type="range" min="0" max="5" step="0.1" value={tk.fadeIn} onChange={(e) => patch(tk.id, { fadeIn: Number(e.target.value) })} /></label>
                    <label title={`${t.fadeOut} (${tk.fadeOut.toFixed(1)}s)`}>↘<input type="range" min="0" max="5" step="0.1" value={tk.fadeOut} onChange={(e) => patch(tk.id, { fadeOut: Number(e.target.value) })} /></label>
                    <label title={t.low} className="mt-eqk">L<input type="range" min="-12" max="12" step="1" value={tk.eq.low} onChange={(e) => patch(tk.id, (p) => ({ eq: { ...p.eq, low: Number(e.target.value) } }))} /></label>
                    <label title={t.mid} className="mt-eqk">M<input type="range" min="-12" max="12" step="1" value={tk.eq.mid} onChange={(e) => patch(tk.id, (p) => ({ eq: { ...p.eq, mid: Number(e.target.value) } }))} /></label>
                    <label title={t.high} className="mt-eqk">H<input type="range" min="-12" max="12" step="1" value={tk.eq.high} onChange={(e) => patch(tk.id, (p) => ({ eq: { ...p.eq, high: Number(e.target.value) } }))} /></label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-timeline" ref={laneWrapRef}>
              <div className="mt-inner" style={{ width: innerW }}>
                <div className="mt-ruler" style={{ height: RULER_H }} onPointerDown={seek}>
                  {Array.from({ length: Math.ceil(totalDur) + 1 }).map((_, i) => (
                    <span key={i} className="mt-tick" style={{ left: i * pxPerSec }}>{i % (pxPerSec < 40 ? 5 : 1) === 0 ? fmt(i) : ''}</span>
                  ))}
                </div>
                {tracks.map((tk) => (
                  <div className="mt-lane" key={tk.id} style={{ height: ROW_H }} onPointerDown={seek}>
                    <div className="mt-clip" style={{ left: tk.offset * pxPerSec, width: (tk.trimEnd - tk.trimStart) * pxPerSec, borderColor: tk.color }}
                      onPointerDown={(e) => startDrag(e, tk, 'move')}>
                      <span className="mt-handle l" onPointerDown={(e) => startDrag(e, tk, 'trimL')} />
                      <canvas ref={(el) => { if (el) canvasRefs.current[tk.id] = el; }} className="mt-wave" />
                      <span className="mt-handle r" onPointerDown={(e) => startDrag(e, tk, 'trimR')} />
                    </div>
                  </div>
                ))}
                <div className="mt-playhead" style={{ left: playhead * pxPerSec, height: RULER_H + tracks.length * ROW_H }} />
              </div>
            </div>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac" multiple hidden
        onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default MultitrackEditor;
