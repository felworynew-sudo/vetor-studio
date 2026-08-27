import { useRef, useState } from 'react';

// Base64 / data-URI кодер: текст ⇆ base64 и картинка → data-URI (для инлайна в
// CSS/HTML без отдельного файла). Копирование в клик. Всё локально.

const TEXT = {
  ru: {
    tabText: 'Текст', tabImg: 'Картинка', encode: 'Кодировать', decode: 'Декодировать',
    input: 'Ввод', output: 'Результат', copy: 'Копировать', copied: 'Скопировано', copyCss: 'CSS фон',
    drop: 'Перетащите картинку или нажмите', hint: 'Любая картинка → data-URI. Локально.', err: 'Не удалось декодировать base64',
    note: 'Base64 удобно инлайнить мелкие иконки/картинки прямо в CSS/HTML. Всё считается в браузере.',
  },
  en: {
    tabText: 'Text', tabImg: 'Image', encode: 'Encode', decode: 'Decode',
    input: 'Input', output: 'Result', copy: 'Copy', copied: 'Copied', copyCss: 'CSS bg',
    drop: 'Drop an image or click', hint: 'Any image → data-URI. Local.', err: 'Could not decode base64',
    note: 'Base64 is handy for inlining small icons/images straight into CSS/HTML. Runs in your browser.',
  },
};

function Base64Tool({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [tab, setTab] = useState('text');
  const [dir, setDir] = useState('encode');
  const [input, setInput] = useState('');
  const [dataUri, setDataUri] = useState('');
  const [copied, setCopied] = useState(null);

  let output = ''; let decodeErr = false;
  if (tab === 'text') {
    try { output = dir === 'encode' ? btoa(unescape(encodeURIComponent(input))) : decodeURIComponent(escape(atob(input.trim()))); }
    catch { decodeErr = dir === 'decode' && !!input; }
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const r = new FileReader(); r.onload = () => setDataUri(r.result); r.readAsDataURL(file);
  }
  function copy(text, tag) { navigator.clipboard?.writeText(text).then(() => { setCopied(tag); setTimeout(() => setCopied(null), 1400); }); }

  return (
    <div className="tool-panel base64">
      <div className="tool-field">
        <div className="segmented">
          <button type="button" className={tab === 'text' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTab('text')}>{t.tabText}</button>
          <button type="button" className={tab === 'image' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTab('image')}>{t.tabImg}</button>
        </div>
      </div>

      {tab === 'text' ? (
        <>
          <div className="tool-field">
            <div className="segmented">
              <button type="button" className={dir === 'encode' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setDir('encode')}>{t.encode}</button>
              <button type="button" className={dir === 'decode' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setDir('decode')}>{t.decode}</button>
            </div>
          </div>
          <label className="tool-field"><span className="tool-field-label">{t.input}</span>
            <textarea className="b64-area" value={input} spellCheck={false} onChange={(e) => setInput(e.target.value)} placeholder={dir === 'encode' ? 'Привет' : '0J/RgNC40LLQtdGC'} />
          </label>
          {decodeErr ? <p className="color-invalid">{t.err}</p> : (
            <label className="tool-field"><span className="tool-field-label">{t.output}</span><textarea className="b64-area" value={output} readOnly /></label>
          )}
          <div className="tool-actions"><button type="button" className="tool-btn primary" onClick={() => copy(output, 'out')} disabled={!output}>{copied === 'out' ? `✓ ${t.copied}` : t.copy}</button></div>
        </>
      ) : (
        <>
          {!dataUri ? (
            <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
              <span className="tool-dropzone-title">{t.drop}</span>
              <span className="tool-dropzone-hint">{t.hint}</span>
            </button>
          ) : (
            <>
              <div className="iso-stage" style={{ padding: 16, minHeight: 160 }}><img src={dataUri} alt="" className="grade-canvas" style={{ maxHeight: '40vh' }} /></div>
              <label className="tool-field"><span className="tool-field-label">data-URI ({Math.round(dataUri.length / 1024)} KB)</span><textarea className="b64-area" value={dataUri} readOnly /></label>
              <div className="tool-actions">
                <button type="button" className="tool-btn primary" onClick={() => copy(dataUri, 'uri')}>{copied === 'uri' ? `✓ ${t.copied}` : t.copy}</button>
                <button type="button" className="tool-btn" onClick={() => copy(`background-image: url("${dataUri}");`, 'css')}>{copied === 'css' ? `✓ ${t.copied}` : t.copyCss}</button>
                <button type="button" className="tool-btn ghost" onClick={() => { setDataUri(''); }}>✕</button>
              </div>
            </>
          )}
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
        </>
      )}
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default Base64Tool;
