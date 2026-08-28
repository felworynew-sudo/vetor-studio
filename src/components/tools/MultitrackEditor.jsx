import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeAudioFile, encodeWAV, encodeMp3, getAudioCtx, downloadBlob } from '../../utils/wav';
import { takeAudioHandoff } from '../../utils/audioHandoff';

// Многодорожечный аудио-редактор V2. На дорожке может быть НЕСКОЛЬКО клипов;
// ножницы режут клип в позиции плейхеда; зум таймлинии колёсиком мыши; параметры
// (громкость/панорама/эквалайзер/mute/solo) применяются НА ЛЕТУ во время
// воспроизведения (держим ссылки на живые узлы графа); сворачиваемая панель
// эффектов слева освобождает таймлинию. Сведение в WAV/MP3 через OfflineAudioContext.
// Скорость меняет и темп, и тон (playbackRate). Всё локально.

const ROW_H = 96;
const RULER_H = 26;
const CLIP_COLORS = ['#6166ff', '#ff5c63', '#3ec98a', '#f5c84c', '#75d0ff', '#b277ff', '#ff8a3d', '#ff5cb0'];

const TEXT = {
  ru: {
    drop: 'Перетащите аудио или нажмите — можно несколько файлов', hint: 'WAV, MP3, OGG, FLAC, M4A — всё локально',
    play: 'Играть', stop: 'Стоп', master: 'Общая', speed: 'Скорость', addTrack: 'Дорожка',
    exportWav: 'В WAV', exportMp3: 'В MP3', rendering: 'Свожу…', tools: 'Эффекты', panel: 'Панель',
    select: 'Выбор', cut: 'Ножницы', vol: 'Громкость', pan: 'Панорама', mute: 'Тихо', solo: 'Соло',
    fadeIn: 'Фейд ↗', fadeOut: 'Фейд ↘', eq: 'Эквалайзер', low: 'Низ', mid: 'Середина', high: 'Верх',
    reverse: 'Реверс', dupl: 'Дублировать', delClip: 'Удалить клип', delTrack: 'Удалить дорожку',
    noSel: 'Выберите клип на таймлинии, чтобы редактировать. Файлы можно бросать прямо на дорожку.',
    dropLane: 'бросьте аудио', note: 'Скорость меняет темп и тон. Всё локально — файлы не уходят на сервер.',
  },
  en: {
    drop: 'Drop audio or click — several files at once', hint: 'WAV, MP3, OGG, FLAC, M4A — all local',
    play: 'Play', stop: 'Stop', master: 'Master', speed: 'Speed', addTrack: 'Track',
    exportWav: 'To WAV', exportMp3: 'To MP3', rendering: 'Mixing…', tools: 'Effects', panel: 'Panel',
    select: 'Select', cut: 'Scissors', vol: 'Volume', pan: 'Pan', mute: 'Mute', solo: 'Solo',
    fadeIn: 'Fade ↗', fadeOut: 'Fade ↘', eq: 'Equalizer', low: 'Low', mid: 'Mid', high: 'High',
    reverse: 'Reverse', dupl: 'Duplicate', delClip: 'Delete clip', delTrack: 'Delete track',
    noSel: 'Select a clip on the timeline to edit. You can drop files right onto a track.',
    dropLane: 'drop audio', note: 'Speed changes tempo and pitch. All local — files never leave your device.',
  },
};

const fmt = (s) => { if (!Number.isFinite(s)) return '0:00'; const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${String(sec).padStart(2, '0')}`; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
let uid = 0;

function makeClip(buffer, name, offset = 0) {
  uid += 1;
  return { id: uid, buffer, name, offset, trimStart: 0, trimEnd: buffer.duration, fadeIn: 0, fadeOut: 0, color: CLIP_COLORS[(uid - 1) % CLIP_COLORS.length] };
}
function makeTrack(clips = []) {
  uid += 1;
  return { id: uid, name: `Дорожка ${uid}`, gain: 1, pan: 0, muted: false, solo: false, eq: { low: 0, mid: 0, high: 0 }, clips };
}
function reverseBuffer(ctx, buffer) {
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) { const src = buffer.getChannelData(c); const dst = out.getChannelData(c); for (let i = 0, n = src.length; i < n; i += 1) dst[i] = src[n - 1 - i]; }
  return out;
}

function MultitrackEditor({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const laneWrapRef = useRef(null);
  const canvasRefs = useRef({});
  const liveRef = useRef(null); // { master, tracks:{[id]:{low,mid,high,pan,g,srcs}} } во время игры
  const rafRef = useRef(0);
  const dragRef = useRef(null);
  const playStateRef = useRef(null);
  const dropTrackRef = useRef(null);

  const [tracks, setTracks] = useState([]);
  const [pxPerSec, setPxPerSec] = useState(60);
  const [master, setMaster] = useState(1);
  const [rate, setRate] = useState(1);
  const [mp3kbps, setMp3kbps] = useState(192);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState('');
  const [tool, setTool] = useState('select');
  const [sel, setSel] = useState(null); // { trackId, clipId }
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelW, setPanelW] = useState(236);
  const panelDragRef = useRef(null);

  const soloActive = tracks.some((tk) => tk.solo);
  const totalDur = tracks.reduce((m, tk) => Math.max(m, tk.clips.reduce((mm, c) => Math.max(mm, c.offset + (c.trimEnd - c.trimStart)), 0)), 0);
  const selTrack = sel && tracks.find((tk) => tk.id === sel.trackId);
  const selClip = selTrack && selTrack.clips.find((c) => c.id === sel.clipId);

  // --- загрузка ---
  const addFiles = useCallback(async (files, targetTrackId, atSec) => {
    const list = [...files].filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac|opus|weba|webm)$/i.test(f.name));
    if (!list.length) return;
    setBusy('…');
    for (const file of list) {
      try {
        const buffer = await decodeAudioFile(file); // eslint-disable-line no-await-in-loop
        const clip = makeClip(buffer, file.name.replace(/\.[^.]+$/, ''), atSec || 0);
        setTracks((prev) => {
          if (targetTrackId != null) return prev.map((tk) => (tk.id === targetTrackId ? { ...tk, clips: [...tk.clips, clip] } : tk));
          return [...prev, makeTrack([clip])];
        });
      } catch { /* пропуск */ }
    }
    setBusy('');
  }, []);

  useEffect(() => { const h = takeAudioHandoff(); if (h && h.buffer) setTracks((prev) => [...prev, makeTrack([makeClip(h.buffer, h.name || 'audio')])]); }, []);

  const patchTrack = (id, upd) => setTracks((prev) => prev.map((tk) => (tk.id === id ? { ...tk, ...(typeof upd === 'function' ? upd(tk) : upd) } : tk)));
  const patchClip = (trackId, clipId, upd) => setTracks((prev) => prev.map((tk) => (tk.id !== trackId ? tk : { ...tk, clips: tk.clips.map((c) => (c.id === clipId ? { ...c, ...(typeof upd === 'function' ? upd(c) : upd) } : c)) })));
  const removeTrack = (id) => { setTracks((prev) => prev.filter((tk) => tk.id !== id)); delete canvasRefs.current[id]; if (sel?.trackId === id) setSel(null); };
  const removeClip = (trackId, clipId) => { setTracks((prev) => prev.map((tk) => (tk.id !== trackId ? tk : { ...tk, clips: tk.clips.filter((c) => c.id !== clipId) }))); setSel(null); };

  // --- отрисовка волн ---
  const drawClip = useCallback((clip) => {
    const canvas = canvasRefs.current[clip.id]; if (!canvas) return;
    const clipLen = clip.trimEnd - clip.trimStart; const w = Math.max(1, Math.round(clipLen * pxPerSec)); const h = ROW_H - 26;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const data = clip.buffer.getChannelData(0); const sr = clip.buffer.sampleRate;
    const startSample = Math.floor(clip.trimStart * sr); const totalSamples = Math.floor(clipLen * sr); const step = Math.max(1, Math.floor(totalSamples / w));
    ctx.fillStyle = clip.color; const mid = h / 2;
    for (let x = 0; x < w; x += 1) {
      let mn = 1; let mx = -1; const s0 = startSample + Math.floor((x / w) * totalSamples);
      for (let i = 0; i < step; i += 1) { const v = data[s0 + i] || 0; if (v < mn) mn = v; if (v > mx) mx = v; }
      ctx.fillRect(x, mid + mn * (mid - 2), 1, Math.max(1, (mx - mn) * (mid - 2)));
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
    if (clip.fadeIn > 0) { ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(clamp(clip.fadeIn * pxPerSec, 0, w), 0); ctx.stroke(); }
    if (clip.fadeOut > 0) { ctx.beginPath(); ctx.moveTo(w, h); ctx.lineTo(w - clamp(clip.fadeOut * pxPerSec, 0, w), 0); ctx.stroke(); }
  }, [pxPerSec]);

  useEffect(() => { tracks.forEach((tk) => tk.clips.forEach(drawClip)); }, [tracks, pxPerSec, drawClip]);

  // --- перетаскивание / тримминг клипа ---
  function startDrag(e, trackId, clip, mode) {
    if (tool === 'cut') return; // в режиме ножниц — рез, не перетаскивание
    e.preventDefault(); e.stopPropagation();
    setSel({ trackId, clipId: clip.id });
    dragRef.current = { trackId, clipId: clip.id, mode, startX: e.clientX, offset: clip.offset, trimStart: clip.trimStart, trimEnd: clip.trimEnd };
    window.addEventListener('pointermove', onDrag); window.addEventListener('pointerup', endDrag);
  }
  function onDrag(e) {
    const d = dragRef.current; if (!d) return; const ds = (e.clientX - d.startX) / pxPerSec;
    patchClip(d.trackId, d.clipId, (c) => {
      const dur = c.buffer.duration;
      if (d.mode === 'move') return { offset: Math.max(0, d.offset + ds) };
      if (d.mode === 'trimL') return { trimStart: clamp(d.trimStart + ds, 0, c.trimEnd - 0.05) };
      if (d.mode === 'trimR') return { trimEnd: clamp(d.trimEnd + ds, c.trimStart + 0.05, dur) };
      return {};
    });
  }
  function endDrag() { dragRef.current = null; window.removeEventListener('pointermove', onDrag); window.removeEventListener('pointerup', endDrag); }

  // --- ножницы: режем клип в точке клика ---
  function cutAt(e, trackId, clip) {
    if (tool !== 'cut') return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const secInClip = (e.clientX - rect.left) / pxPerSec; // от начала клипа
    const at = clip.trimStart + secInClip;
    if (at <= clip.trimStart + 0.05 || at >= clip.trimEnd - 0.05) return;
    setTracks((prev) => prev.map((tk) => {
      if (tk.id !== trackId) return tk;
      const clips = [];
      for (const c of tk.clips) {
        if (c.id !== clip.id) { clips.push(c); continue; }
        uid += 1; const left = { ...c, trimEnd: at, fadeOut: 0 };
        uid += 1; const right = { ...c, id: uid, offset: c.offset + secInClip, trimStart: at, fadeIn: 0, color: c.color };
        left.id = c.id; clips.push(left, right);
      }
      return { ...tk, clips };
    }));
  }

  // --- построение графа (общее для live и offline) ---
  function buildGraph(ctx, masterVal, base, playheadSec, r, solo) {
    const masterGain = ctx.createGain(); masterGain.gain.value = masterVal; masterGain.connect(ctx.destination);
    const live = {};
    for (const tk of tracks) {
      const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 250; low.gain.value = tk.eq.low;
      const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = 0.9; mid.gain.value = tk.eq.mid;
      const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4000; high.gain.value = tk.eq.high;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pan) pan.pan.value = tk.pan;
      const g = ctx.createGain(); g.gain.value = (!solo || tk.solo) && !tk.muted ? tk.gain : 0;
      low.connect(mid); mid.connect(high); if (pan) { high.connect(pan); pan.connect(g); } else high.connect(g); g.connect(masterGain);
      const srcs = [];
      for (const clip of tk.clips) {
        const clipLen = clip.trimEnd - clip.trimStart; const projEnd = clip.offset + clipLen; if (projEnd <= playheadSec) continue;
        const into = Math.max(0, playheadSec - clip.offset); const bufStart = clip.trimStart + into; const dur = clip.trimEnd - bufStart; if (dur <= 0) continue;
        const projStart = Math.max(clip.offset, playheadSec); const when = base + (projStart - playheadSec) / r;
        const cg = ctx.createGain(); const src = ctx.createBufferSource(); src.buffer = clip.buffer; src.playbackRate.value = r;
        src.connect(cg); cg.connect(low);
        const fi = Math.max(0, clip.fadeIn) / r; const fo = Math.max(0, clip.fadeOut) / r; const playDur = dur / r;
        cg.gain.setValueAtTime(1, when);
        if (fi > 0 && into < clip.fadeIn) { cg.gain.setValueAtTime(0, when); cg.gain.linearRampToValueAtTime(1, when + fi); }
        if (fo > 0) { const fs = when + Math.max(0, playDur - fo); cg.gain.setValueAtTime(1, fs); cg.gain.linearRampToValueAtTime(0, when + playDur); }
        src.start(when, bufStart, dur); srcs.push(src);
      }
      live[tk.id] = { low, mid, high, pan, g, srcs };
    }
    return { master: masterGain, live };
  }

  const stop = useCallback(() => {
    const l = liveRef.current;
    if (l) Object.values(l.live).forEach((tl) => tl.srcs.forEach((s) => { try { s.stop(); } catch { /* */ } }));
    liveRef.current = null; cancelAnimationFrame(rafRef.current); playStateRef.current = null; setPlaying(false);
  }, []);

  const play = useCallback((from) => {
    if (!tracks.length) return; stop();
    const ctx = getAudioCtx(); if (ctx.state === 'suspended') ctx.resume();
    const startPlayhead = from != null ? from : playhead; if (startPlayhead >= totalDur) return;
    const base = ctx.currentTime + 0.06;
    const graph = buildGraph(ctx, master, base, startPlayhead, rate, soloActive);
    liveRef.current = graph; playStateRef.current = { base, startPlayhead, rate }; setPlaying(true);
    const tick = () => {
      const st = playStateRef.current; if (!st) return;
      const pos = st.startPlayhead + (ctx.currentTime - st.base) * st.rate;
      if (pos >= totalDur) { setPlayhead(totalDur); stop(); return; }
      setPlayhead(Math.max(0, pos)); rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [tracks, playhead, totalDur, master, rate, soloActive, stop]);

  // ЖИВОЕ применение параметров: когда играет, обновляем узлы графа без рестарта.
  useEffect(() => {
    const l = liveRef.current; if (!l) return;
    const ctx = getAudioCtx(); const now = ctx.currentTime;
    l.master.gain.setTargetAtTime(master, now, 0.02);
    for (const tk of tracks) {
      const tl = l.live[tk.id]; if (!tl) continue; // eslint-disable-line no-continue
      const audible = (!soloActive || tk.solo) && !tk.muted;
      tl.g.gain.setTargetAtTime(audible ? tk.gain : 0, now, 0.02);
      if (tl.pan) tl.pan.pan.setTargetAtTime(tk.pan, now, 0.02);
      tl.low.gain.setTargetAtTime(tk.eq.low, now, 0.02);
      tl.mid.gain.setTargetAtTime(tk.eq.mid, now, 0.02);
      tl.high.gain.setTargetAtTime(tk.eq.high, now, 0.02);
    }
  }, [tracks, master, soloActive]);

  useEffect(() => () => stop(), [stop]);

  function seek(e) {
    if (tool === 'cut') return;
    const wrap = laneWrapRef.current; if (!wrap) return; const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left + wrap.scrollLeft; const pos = clamp(x / pxPerSec, 0, totalDur || 0);
    setPlayhead(pos); if (playing) play(pos);
  }

  // Зум колёсиком (к позиции курсора).
  function onWheel(e) {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // горизонтальный скролл не трогаем
    e.preventDefault();
    const wrap = laneWrapRef.current; const rect = wrap.getBoundingClientRect();
    const mouseX = e.clientX - rect.left + wrap.scrollLeft; const secAtMouse = mouseX / pxPerSec;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const next = clamp(pxPerSec * factor, 12, 400);
    setPxPerSec(next);
    requestAnimationFrame(() => { if (laneWrapRef.current) laneWrapRef.current.scrollLeft = secAtMouse * next - (e.clientX - rect.left); });
  }

  // Ресайз левой панели перетаскиванием её правого края.
  function startPanelResize(e) {
    e.preventDefault(); e.stopPropagation();
    panelDragRef.current = { startX: e.clientX, startW: panelW };
    window.addEventListener('pointermove', onPanelResize);
    window.addEventListener('pointerup', endPanelResize);
  }
  function onPanelResize(e) { const d = panelDragRef.current; if (!d) return; setPanelW(clamp(d.startW + (e.clientX - d.startX), 150, 460)); }
  function endPanelResize() { panelDragRef.current = null; window.removeEventListener('pointermove', onPanelResize); window.removeEventListener('pointerup', endPanelResize); }

  async function exportMix(kind) {
    if (!tracks.length || busy) return; stop(); setBusy(t.rendering);
    try {
      const sr = 44100; const len = Math.ceil((totalDur / rate + 0.2) * sr);
      const octx = new OfflineAudioContext(2, len, sr);
      buildGraph(octx, master, 0, 0, rate, soloActive);
      const rendered = await octx.startRendering();
      const blob = kind === 'mp3' ? await encodeMp3(rendered, mp3kbps) : encodeWAV(rendered);
      downloadBlob(blob, `mix-${Math.round(totalDur)}s.${kind}`);
    } catch { /* */ }
    setBusy('');
  }

  function reverseSelClip() { if (!selClip) return; const buf = reverseBuffer(getAudioCtx(), selClip.buffer); patchClip(sel.trackId, sel.clipId, { buffer: buf }); }
  function dupSelClip() { if (!selClip) return; const c = makeClip(selClip.buffer, selClip.name, selClip.offset + (selClip.trimEnd - selClip.trimStart)); c.trimStart = selClip.trimStart; c.trimEnd = selClip.trimEnd; c.color = selClip.color; patchTrack(sel.trackId, (tk) => ({ clips: [...tk.clips, c] })); }

  const innerW = Math.max(360, Math.ceil(totalDur * pxPerSec) + 40);

  if (tracks.length === 0) {
    return (
      <div className="tool-panel mt">
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
          <span className="tool-dropzone-title">{busy || t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
        <input ref={inputRef} type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <p className="tool-local-note">🔒 {t.note}</p>
      </div>
    );
  }

  return (
    <div className="tool-panel mt">
      <div className="mt-transport">
        <button type="button" className={playing ? 'tool-btn' : 'tool-btn primary'} onClick={() => (playing ? stop() : play())}>{playing ? `■ ${t.stop}` : `▶ ${t.play}`}</button>
        <span className="mt-time num">{fmt(playhead)} / {fmt(totalDur)}</span>
        <div className="segmented mt-tools">
          <button type="button" title={t.select} className={tool === 'select' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTool('select')}>▯</button>
          <button type="button" title={t.cut} className={tool === 'cut' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTool('cut')}>✂</button>
        </div>
        <label className="mt-knob"><span>{t.master}</span><input type="range" min="0" max="1.5" step="0.01" value={master} onChange={(e) => setMaster(Number(e.target.value))} /></label>
        <label className="mt-knob"><span>{t.speed} ×{rate.toFixed(2)}</span><input type="range" min="0.5" max="2" step="0.05" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></label>
        <div className="mt-transport-spacer" />
        <button type="button" className="tool-btn small" onClick={() => inputRef.current?.click()}>+ {t.addTrack}</button>
        <button type="button" className="tool-btn" disabled={!!busy} onClick={() => exportMix('wav')}>{busy || t.exportWav}</button>
        <div className="segmented mt-kbps">{[128, 192, 320].map((b) => (<button key={b} type="button" className={mp3kbps === b ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMp3kbps(b)}>{b}</button>))}</div>
        <button type="button" className="tool-btn" disabled={!!busy} onClick={() => exportMix('mp3')}>{t.exportMp3}</button>
      </div>

      <div className="mt-body">
        <div className={panelOpen ? 'mt-panel' : 'mt-panel is-closed'} style={panelOpen ? { width: panelW } : undefined}>
          <button type="button" className="mt-panel-toggle" onClick={() => setPanelOpen((v) => !v)} title={t.panel}>{panelOpen ? '‹' : '›'}</button>
          {panelOpen && <span className="mt-panel-resize" onPointerDown={startPanelResize} title="↔" />}
          {panelOpen && (selClip ? (
            <div className="mt-panel-in">
              <div className="mt-panel-title">{selClip.name}</div>
              <label className="mt-p-field"><span>{t.vol} {Math.round(selTrack.gain * 100)}%</span><input type="range" min="0" max="1.5" step="0.01" value={selTrack.gain} onChange={(e) => patchTrack(sel.trackId, { gain: Number(e.target.value) })} /></label>
              <label className="mt-p-field"><span>{t.pan}</span><input type="range" min="-1" max="1" step="0.02" value={selTrack.pan} onChange={(e) => patchTrack(sel.trackId, { pan: Number(e.target.value) })} /></label>
              <div className="mt-p-row">
                <button type="button" className={selTrack.muted ? 'mt-tag is-on' : 'mt-tag'} onClick={() => patchTrack(sel.trackId, (p) => ({ muted: !p.muted }))}>{t.mute}</button>
                <button type="button" className={selTrack.solo ? 'mt-tag is-solo' : 'mt-tag'} onClick={() => patchTrack(sel.trackId, (p) => ({ solo: !p.solo }))}>{t.solo}</button>
              </div>
              <label className="mt-p-field"><span>{t.fadeIn} {selClip.fadeIn.toFixed(1)}s</span><input type="range" min="0" max="5" step="0.1" value={selClip.fadeIn} onChange={(e) => patchClip(sel.trackId, sel.clipId, { fadeIn: Number(e.target.value) })} /></label>
              <label className="mt-p-field"><span>{t.fadeOut} {selClip.fadeOut.toFixed(1)}s</span><input type="range" min="0" max="5" step="0.1" value={selClip.fadeOut} onChange={(e) => patchClip(sel.trackId, sel.clipId, { fadeOut: Number(e.target.value) })} /></label>
              <div className="mt-p-title2">{t.eq}</div>
              <label className="mt-p-field"><span>{t.low} {selTrack.eq.low}</span><input type="range" min="-12" max="12" step="1" value={selTrack.eq.low} onChange={(e) => patchTrack(sel.trackId, (p) => ({ eq: { ...p.eq, low: Number(e.target.value) } }))} /></label>
              <label className="mt-p-field"><span>{t.mid} {selTrack.eq.mid}</span><input type="range" min="-12" max="12" step="1" value={selTrack.eq.mid} onChange={(e) => patchTrack(sel.trackId, (p) => ({ eq: { ...p.eq, mid: Number(e.target.value) } }))} /></label>
              <label className="mt-p-field"><span>{t.high} {selTrack.eq.high}</span><input type="range" min="-12" max="12" step="1" value={selTrack.eq.high} onChange={(e) => patchTrack(sel.trackId, (p) => ({ eq: { ...p.eq, high: Number(e.target.value) } }))} /></label>
              <div className="mt-p-actions">
                <button type="button" className="tool-btn small" onClick={reverseSelClip}>{t.reverse}</button>
                <button type="button" className="tool-btn small" onClick={dupSelClip}>{t.dupl}</button>
                <button type="button" className="tool-btn small ghost" onClick={() => removeClip(sel.trackId, sel.clipId)}>{t.delClip}</button>
              </div>
            </div>
          ) : <div className="mt-panel-empty">{t.noSel}</div>)}
        </div>

        <div className="mt-timeline" ref={laneWrapRef} onWheel={onWheel}>
          <div className="mt-inner" style={{ width: innerW }}>
            <div className="mt-ruler" style={{ height: RULER_H }} onPointerDown={seek}>
              {Array.from({ length: Math.ceil(totalDur) + 1 }).map((_, i) => (<span key={i} className="mt-tick" style={{ left: i * pxPerSec }}>{i % (pxPerSec < 40 ? 5 : 1) === 0 ? fmt(i) : ''}</span>))}
            </div>
            {tracks.map((tk) => (
              <div key={tk.id} className="mt-lane" style={{ height: ROW_H }} onPointerDown={seek}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); const at = (e.clientX - rect.left) / pxPerSec; addFiles(e.dataTransfer.files, tk.id, Math.max(0, at)); }}>
                {tk.clips.map((clip) => (
                  <div key={clip.id} className={sel?.clipId === clip.id ? 'mt-clip is-sel' : 'mt-clip'}
                    style={{ left: clip.offset * pxPerSec, width: (clip.trimEnd - clip.trimStart) * pxPerSec, borderColor: clip.color, cursor: tool === 'cut' ? 'col-resize' : 'grab' }}
                    onPointerDown={(e) => (tool === 'cut' ? cutAt(e, tk.id, clip) : startDrag(e, tk.id, clip, 'move'))}>
                    <span className="mt-clip-name">{clip.name}</span>
                    {tool !== 'cut' && <span className="mt-handle l" onPointerDown={(e) => startDrag(e, tk.id, clip, 'trimL')} />}
                    <canvas ref={(el) => { if (el) canvasRefs.current[clip.id] = el; }} className="mt-wave" />
                    {tool !== 'cut' && <span className="mt-handle r" onPointerDown={(e) => startDrag(e, tk.id, clip, 'trimR')} />}
                  </div>
                ))}
                <button type="button" className="mt-lane-del" onClick={(e) => { e.stopPropagation(); removeTrack(tk.id); }} title={t.delTrack}>✕</button>
              </div>
            ))}
            <div className="mt-playhead" style={{ left: playhead * pxPerSec, height: RULER_H + tracks.length * ROW_H }} />
          </div>
        </div>
      </div>

      <input ref={inputRef} type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default MultitrackEditor;
