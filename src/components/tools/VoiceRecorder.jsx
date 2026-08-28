import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeWAV, encodeMp3, getAudioCtx, downloadBlob } from '../../utils/wav';
import { setAudioHandoff } from '../../utils/audioHandoff';
import { buildToolPath } from '../../utils/routing';

// Диктофон: запись с микрофона (getUserMedia + MediaRecorder), пауза, таймер и
// индикатор уровня, прослушивание, экспорт в WAV и MP3. Всё локально — запись
// никуда не отправляется.

const TEXT = {
  ru: {
    title: 'Запись с микрофона', start: 'Запись', stop: 'Стоп', pause: 'Пауза', resume: 'Продолжить',
    again: 'Записать заново', denied: 'Нет доступа к микрофону. Разрешите доступ в браузере и попробуйте снова.',
    nomic: 'Микрофон недоступен в этом браузере.', preview: 'Прослушать', encoding: 'Кодирование…',
    ns: 'Шумоподавление', ec: 'Эхоподавление', dl: 'Скачать', level: 'Уровень',
    toEditor: 'В аудио-редактор',
    note: 'Запись идёт локально в браузере и не загружается на сервер. Для MP3 звук кодируется на вашем устройстве.',
  },
  en: {
    title: 'Microphone recording', start: 'Record', stop: 'Stop', pause: 'Pause', resume: 'Resume',
    again: 'Record again', denied: 'No microphone access. Allow it in the browser and try again.',
    nomic: 'Microphone is not available in this browser.', preview: 'Play back', encoding: 'Encoding…',
    ns: 'Noise suppression', ec: 'Echo cancellation', dl: 'Download', level: 'Level',
    toEditor: 'To audio editor',
    note: 'Recording runs locally in the browser and is never uploaded. MP3 is encoded on your device.',
  },
};

function fmtTime(s) {
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function VoiceRecorder({ language = 'ru', go }) {
  const t = TEXT[language] || TEXT.ru;
  const supported = typeof navigator !== 'undefined' && navigator.mediaDevices && window.MediaRecorder;

  const [status, setStatus] = useState('idle'); // idle | recording | paused | recorded | encoding | error
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [url, setUrl] = useState('');
  const [ns, setNs] = useState(true);
  const [ec, setEc] = useState(true);

  const recRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const bufferRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(0);
  const timerRef = useRef(0);
  const startAtRef = useRef(0);
  const accRef = useRef(0);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach((tr) => tr.stop()); streamRef.current = null; }
  }, []);

  useEffect(() => () => { cleanup(); if (url) URL.revokeObjectURL(url); }, [cleanup, url]);

  function meter() {
    const an = analyserRef.current; if (!an) return;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) { const v = (buf[i] - 128) / 128; sum += v * v; }
    setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 2.2));
    rafRef.current = requestAnimationFrame(meter);
  }

  async function start() {
    try {
      if (url) { URL.revokeObjectURL(url); setUrl(''); }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: ns, echoCancellation: ec, autoGainControl: true },
      });
      streamRef.current = stream;
      const ctx = getAudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
      source.connect(analyser); analyserRef.current = analyser;

      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = onStop;
      recRef.current = rec;
      rec.start(200);

      accRef.current = 0; startAtRef.current = Date.now(); setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((accRef.current + (Date.now() - startAtRef.current)) / 1000), 200);
      meter();
      setStatus('recording');
    } catch (e) {
      console.error(e); setStatus('error');
    }
  }

  async function onStop() {
    cancelAnimationFrame(rafRef.current); clearInterval(timerRef.current); setLevel(0);
    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
    try {
      const ab = await blob.arrayBuffer();
      bufferRef.current = await getAudioCtx().decodeAudioData(ab);
    } catch { bufferRef.current = null; }
    setUrl(URL.createObjectURL(blob));
    if (streamRef.current) { streamRef.current.getTracks().forEach((tr) => tr.stop()); streamRef.current = null; }
    setStatus('recorded');
  }

  function stop() { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); }
  function pause() { if (recRef.current?.state === 'recording') { recRef.current.pause(); accRef.current += Date.now() - startAtRef.current; clearInterval(timerRef.current); cancelAnimationFrame(rafRef.current); setStatus('paused'); } }
  function resume() { if (recRef.current?.state === 'paused') { recRef.current.resume(); startAtRef.current = Date.now(); timerRef.current = setInterval(() => setSeconds((accRef.current + (Date.now() - startAtRef.current)) / 1000), 200); meter(); setStatus('recording'); } }

  async function exportAs(kind) {
    const buffer = bufferRef.current;
    if (!buffer) return;
    setStatus('encoding');
    try {
      const blob = kind === 'mp3' ? await encodeMp3(buffer, 192) : encodeWAV(buffer);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      downloadBlob(blob, `recording-${stamp}.${kind}`);
    } catch (e) { console.error(e); }
    setStatus('recorded');
  }

  // Передаёт запись в многодорожечный редактор без перезагрузки (SPA-переход).
  function goToEditor(e) {
    const buffer = bufferRef.current;
    if (!buffer) return;
    const name = `${language === 'en' ? 'Recording' : 'Запись'} ${fmtTime(Math.round(buffer.duration))}`;
    setAudioHandoff({ buffer, name });
    if (go) go(buildToolPath('multitrack'))(e);
  }

  if (!supported) return <div className="tool-panel"><p className="color-invalid">{t.nomic}</p></div>;

  const busy = status === 'encoding';

  return (
    <div className="tool-panel recorder">
      <div className="rec-stage">
        <div className={`rec-orb status-${status}`}>
          <span className="rec-orb-fill" style={{ transform: `scale(${status === 'recording' ? 0.55 + level * 0.6 : 0.55})` }} />
          <span className="rec-time">{fmtTime(seconds)}</span>
        </div>

        {(status === 'recording' || status === 'paused') && (
          <div className="rec-meter"><span className="tool-field-label">{t.level}</span><div className="rec-meter-bar"><div className="rec-meter-fill" style={{ width: `${Math.round(level * 100)}%` }} /></div></div>
        )}
      </div>

      {status === 'error' && <p className="color-invalid">{t.denied}</p>}

      {url && status !== 'recording' && status !== 'paused' && (
        <audio className="rec-audio" src={url} controls />
      )}

      <div className="rec-controls">
        {(status === 'idle' || status === 'recorded' || status === 'error') && (
          <button type="button" className="tool-btn primary rec-main" onClick={start}>● {status === 'recorded' ? t.again : t.start}</button>
        )}
        {status === 'recording' && (
          <>
            <button type="button" className="tool-btn rec-main is-rec" onClick={stop}>■ {t.stop}</button>
            <button type="button" className="tool-btn ghost" onClick={pause}>⏸ {t.pause}</button>
          </>
        )}
        {status === 'paused' && (
          <>
            <button type="button" className="tool-btn rec-main" onClick={resume}>▶ {t.resume}</button>
            <button type="button" className="tool-btn ghost" onClick={stop}>■ {t.stop}</button>
          </>
        )}
      </div>

      {(status === 'recorded' || busy) && bufferRef.current && (
        <div className="rec-export">
          <span className="tool-field-label">{t.dl}</span>
          <div className="rec-export-btns">
            <button type="button" className="tool-btn" onClick={() => exportAs('wav')} disabled={busy}>WAV</button>
            <button type="button" className="tool-btn" onClick={() => exportAs('mp3')} disabled={busy}>MP3</button>
          </div>
          {busy && <span className="rec-encoding">{t.encoding}</span>}
          <a href={buildToolPath('multitrack')} className="tool-btn rec-to-editor" onClick={goToEditor}>🎛 {t.toEditor}</a>
        </div>
      )}

      {(status === 'idle' || status === 'error') && (
        <div className="rec-opts">
          <label className="rec-opt"><input type="checkbox" checked={ns} onChange={(e) => setNs(e.target.checked)} /> {t.ns}</label>
          <label className="rec-opt"><input type="checkbox" checked={ec} onChange={(e) => setEc(e.target.checked)} /> {t.ec}</label>
        </div>
      )}

      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default VoiceRecorder;
