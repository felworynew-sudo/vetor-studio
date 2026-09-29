import { useCallback, useRef, useState } from 'react';
import { AUDIO_FORMATS, ffmpegRun, loadFFmpeg } from '../../utils/ffmpeg';
import { downloadBlob } from '../../utils/wav';

// Аудио-конвертер на FFmpeg (ffmpeg.wasm): любые входные форматы — MP3, WAV, FLAC,
// OGG, Opus, M4A/AAC, AIFF, WMA, AMR… и даже видео (MP4, MOV, MKV, WebM — достаём
// звук). Выход: MP3, AAC, Opus, OGG, FLAC, WAV; частота, каналы, нормализация
// громкости (EBU R128). Пакетно, ZIP, всё локально.

const TEXT = {
  ru: {
    drop: 'Перетащите аудио или видео — можно несколько', hint: 'MP3, WAV, FLAC, OGG, M4A, AIFF, WMA, AMR, MP4, MOV, MKV, WebM…',
    format: 'Формат', quality: 'Битрейт, кбит/с', rate: 'Частота', channels: 'Каналы', keep: 'как есть', mono: 'моно', stereo: 'стерео', loud: 'Выровнять громкость (−16 LUFS)',
    convertAll: 'Конвертировать', add: 'Добавить', clear: 'Очистить', zip: 'Скачать ZIP', loading: 'Загрузка FFmpeg (~30 МБ, один раз)…',
    download: 'Скачать', converting: 'Конвертирую', done: 'Готово', queued: 'В очереди', error: 'Ошибка',
    note: 'FFmpeg работает прямо в браузере — файлы не покидают устройство. Ядро FFmpeg (GPL) скачивается с jsDelivr при первой конвертации.',
  },
  en: {
    drop: 'Drop audio or video — several at once', hint: 'MP3, WAV, FLAC, OGG, M4A, AIFF, WMA, AMR, MP4, MOV, MKV, WebM…',
    format: 'Format', quality: 'Bitrate, kbps', rate: 'Sample rate', channels: 'Channels', keep: 'keep', mono: 'mono', stereo: 'stereo', loud: 'Normalize loudness (−16 LUFS)',
    convertAll: 'Convert', add: 'Add', clear: 'Clear', zip: 'Download ZIP', loading: 'Loading FFmpeg (~30 MB, once)…',
    download: 'Download', converting: 'Converting', done: 'Done', queued: 'Queued', error: 'Error',
    note: 'FFmpeg runs right in the browser — files never leave your device. The FFmpeg core (GPL) is downloaded from jsDelivr on the first conversion.',
  },
};

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
let cid = 0;

function AudioConverter({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [format, setFormat] = useState('mp3');
  const [bitrate, setBitrate] = useState(192);
  const [rate, setRate] = useState(0);
  const [channels, setChannels] = useState(0);
  const [loud, setLoud] = useState(false);
  const [busy, setBusy] = useState('');
  const fmt = AUDIO_FORMATS[format];

  const addFiles = useCallback((files) => {
    const list = [...files].filter((f) => /^(audio|video)\//.test(f.type) || /\.(wav|mp3|ogg|oga|flac|m4a|aac|opus|weba|webm|aif|aiff|wma|amr|ac3|mp4|mov|mkv|avi|3gp)$/i.test(f.name));
    if (!list.length) return;
    setItems((prev) => [...prev, ...list.map((file) => { cid += 1; return { id: cid, file, name: file.name, status: 'queued', progress: 0 }; })]);
  }, []);

  const patch = (id, p) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  async function convertAll() {
    if (busy) return;
    setBusy(t.loading);
    try { await loadFFmpeg(); } catch (e) { console.error(e); setBusy(''); return; }
    setBusy(t.converting);
    const q = fmt.bitrates.length ? (fmt.bitrates.includes(bitrate) ? bitrate : fmt.bitrates[Math.floor(fmt.bitrates.length / 2)]) : 0;
    for (const item of items) {
      if (item.status === 'done') continue; // eslint-disable-line no-continue
      patch(item.id, { status: 'converting', progress: 0 });
      const args = [...fmt.args(q)];
      if (rate) args.push('-ar', String(rate));
      if (channels) args.push('-ac', String(channels));
      if (loud) args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
      const outName = `out.${fmt.ext}`;
      try {
        const data = await ffmpegRun(item.file, args, outName, { onProgress: (p) => patch(item.id, { progress: p }) }); // eslint-disable-line no-await-in-loop
        const blob = new Blob([data], { type: fmt.mime });
        patch(item.id, { status: 'done', outBlob: blob, outName: `${item.name.replace(/\.[^.]+$/, '')}.${fmt.ext}`, outSize: blob.size });
      } catch (e) { console.error(e); patch(item.id, { status: 'error' }); }
    }
    setBusy('');
  }

  async function zipAll() {
    const { zipSync } = await import('fflate'); const files = {};
    for (const it of items.filter((x) => x.outBlob)) files[it.outName] = [new Uint8Array(await it.outBlob.arrayBuffer()), { level: 0 }]; // eslint-disable-line no-await-in-loop
    downloadBlob(new Blob([zipSync(files)], { type: 'application/zip' }), 'converted-audio.zip');
  }

  const seg = (v, set, list) => <div className="segmented dm-seg">{list.map(([id, l]) => <button key={id} type="button" className={v === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set(id)}>{l}</button>)}</div>;
  const doneCount = items.filter((i) => i.status === 'done').length;

  return (
    <div className="tool-panel audio-converter">
      <div className="tool-controls">
        <div className="tool-field"><span className="tool-field-label">{t.format}</span>{seg(format, setFormat, Object.entries(AUDIO_FORMATS).map(([id, f]) => [id, f.label]))}</div>
        {fmt.bitrates.length > 0 && <div className="tool-field"><span className="tool-field-label">{t.quality}</span>{seg(fmt.bitrates.includes(bitrate) ? bitrate : null, setBitrate, fmt.bitrates.map((b) => [b, String(b)]))}</div>}
        <div className="tool-field"><span className="tool-field-label">{t.rate}</span>{seg(rate, setRate, [[0, t.keep], [44100, '44.1 kHz'], [48000, '48 kHz'], [22050, '22 kHz']])}</div>
        <div className="tool-field"><span className="tool-field-label">{t.channels}</span>{seg(channels, setChannels, [[0, t.keep], [1, t.mono], [2, t.stereo]])}</div>
        <label className="tool-check"><input type="checkbox" checked={loud} onChange={(e) => setLoud(e.target.checked)} /> {t.loud}</label>
      </div>

      <button type="button" className="tool-dropzone ss-drop" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      {items.length > 0 && (
        <>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" disabled={!!busy} onClick={convertAll}>{busy || t.convertAll}</button>
            {doneCount > 1 && <button type="button" className="tool-btn" onClick={zipAll}>{t.zip} ({doneCount})</button>}
            <button type="button" className="tool-btn ghost" onClick={() => setItems([])} disabled={!!busy}>{t.clear}</button>
          </div>
          <ul className="ac-list">
            {items.map((it) => (
              <li key={it.id} className={`ac-item is-${it.status}`}>
                <span className="ac-name" title={it.name}>{it.name}</span>
                <span className="ac-meta">
                  {it.status === 'queued' && <span className="ac-tag">{t.queued}</span>}
                  {it.status === 'converting' && <span className="ac-tag is-run">{t.converting} {Math.round(it.progress * 100)}%</span>}
                  {it.status === 'error' && <span className="ac-tag is-err">{t.error}</span>}
                  {it.status === 'done' && <span className="ac-tag is-ok">{fmtSize(it.file.size)} → {fmtSize(it.outSize)}</span>}
                </span>
                {it.status === 'done'
                  ? <button type="button" className="tool-btn small" onClick={() => downloadBlob(it.outBlob, it.outName)}>↓ {t.download}</button>
                  : <button type="button" className="ac-x" onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))} aria-label="×">✕</button>}
              </li>
            ))}
          </ul>
        </>
      )}
      <input ref={inputRef} type="file" accept="audio/*,video/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.opus,.aif,.aiff,.wma,.amr,.mkv" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default AudioConverter;
