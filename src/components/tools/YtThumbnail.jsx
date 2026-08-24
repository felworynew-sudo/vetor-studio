import { useState } from 'react';

// Скачивание превью YouTube по ссылке на видео. У миниатюр предсказуемые URL на
// i.ytimg.com — всё считается локально, ссылка на сервер не отправляется.

const SIZES = [
  { key: 'maxresdefault', ru: 'Макс. (1280×720)', en: 'Max (1280×720)' },
  { key: 'sddefault', ru: 'SD (640×480)', en: 'SD (640×480)' },
  { key: 'hqdefault', ru: 'HQ (480×360)', en: 'HQ (480×360)' },
  { key: 'mqdefault', ru: 'MQ (320×180)', en: 'MQ (320×180)' },
];

const TEXT = {
  ru: {
    placeholder: 'Вставьте ссылку на видео YouTube или ID',
    get: 'Показать превью', invalid: 'Не удалось распознать видео в ссылке',
    download: 'Скачать', open: 'Открыть', unavailable: 'нет',
    channelNote: 'Аватарку и шапку канала без YouTube API (ключ на сервере) достать нельзя — CORS блокирует. Если нужно — сделаю через бэкенд-бота.',
    hint: 'Работает со ссылками watch?v=, youtu.be, /shorts/, /embed/ и с чистым ID. Максимальное превью есть не у всех видео.',
  },
  en: {
    placeholder: 'Paste a YouTube video URL or ID',
    get: 'Show thumbnails', invalid: 'Could not find a video in the link',
    download: 'Download', open: 'Open', unavailable: 'n/a',
    channelNote: 'Channel avatar/banner cannot be fetched without the YouTube API (server key) — CORS blocks it. I can add it via the backend bot if needed.',
    hint: 'Works with watch?v=, youtu.be, /shorts/, /embed/ links and a bare ID. Max-res thumbnail is not available for every video.',
  },
};

function parseVideoId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
    /\/live\/([\w-]{11})/,
  ];
  for (const p of patterns) { const m = s.match(p); if (m) return m[1]; }
  return null;
}

async function downloadThumb(url, name) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('http');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  } catch {
    // CORS/недоступно — открываем картинку в новой вкладке, чтобы сохранить вручную.
    window.open(url, '_blank', 'noopener');
  }
}

function YtThumbnail({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [raw, setRaw] = useState('');
  const [videoId, setVideoId] = useState('');
  const [error, setError] = useState('');
  const [missing, setMissing] = useState({});

  function run() {
    const id = parseVideoId(raw);
    if (!id) { setError(t.invalid); setVideoId(''); return; }
    setError(''); setMissing({}); setVideoId(id);
  }

  return (
    <div className="tool-panel yt-thumb">
      <div className="yt-input-row">
        <input
          type="text"
          className="yt-input"
          placeholder={t.placeholder}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
        />
        <button type="button" className="tool-btn primary" onClick={run}>{t.get}</button>
      </div>
      {error && <p className="color-invalid">{error}</p>}

      {videoId && (
        <div className="yt-grid">
          {SIZES.map((s) => {
            if (missing[s.key]) return null;
            const url = `https://i.ytimg.com/vi/${videoId}/${s.key}.jpg`;
            return (
              <div key={s.key} className="yt-card">
                <div className="yt-thumb-box">
                  <img
                    src={url}
                    alt={s.key}
                    loading="lazy"
                    onError={() => setMissing((m) => ({ ...m, [s.key]: true }))}
                  />
                </div>
                <span className="yt-size">{s[language] || s.ru}</span>
                <div className="yt-actions">
                  <button type="button" className="tool-btn small primary" onClick={() => downloadThumb(url, `${videoId}-${s.key}.jpg`)}>{t.download}</button>
                  <a className="tool-btn small" href={url} target="_blank" rel="noreferrer noopener">{t.open}</a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="tool-local-note">📺 {t.channelNote}</p>
      <p className="tool-local-note">ℹ️ {t.hint}</p>
    </div>
  );
}

export default YtThumbnail;
