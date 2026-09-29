import { useRef, useState } from 'react';
import { extractPalette, imageToData } from '../../utils/paletteEngine';
import { hexToRgb, rgbToOklab } from '../../utils/oklab';

// Экстрактор палитры 2.0. Ядро — кластеризация в перцептивном OKLab
// (utils/paletteEngine) + семантические роли цветов; вторым слоем — классические
// свотчи node-vibrant (Vibrant/Muted и их тёмные/светлые варианты). Всё локально.

const TEXT = {
  ru: {
    drop: 'Загрузите изображение', hint: 'PNG, JPG, WebP — обрабатывается локально', count: 'Цветов',
    change: 'Другое изображение', copied: 'Скопировано', palette: 'Палитра', roles: 'Роли цветов',
    vibrant: 'Свотчи Vibrant', format: 'Формат', exportCss: 'CSS-переменные', exportJson: 'JSON',
    exportHex: 'Список HEX', copyDone: 'Скопировано в буфер',
    note: 'Цвета группируются в OKLab — пространстве, где расстояние соответствует тому, как разницу видит глаз. Почти одинаковые оттенки сливаются, а мелкие акценты не теряются.',
    role: {
      background: 'Фон', dominant: 'Доминанта', accent: 'Акцент', highlight: 'Светлый', dark: 'Тёмный',
      skin: 'Телесный', muted: 'Приглушённый', vibrant: 'Насыщенный',
    },
  },
  en: {
    drop: 'Upload an image', hint: 'PNG, JPG, WebP — processed locally', count: 'Colors',
    change: 'Another image', copied: 'Copied', palette: 'Palette', roles: 'Color roles',
    vibrant: 'Vibrant swatches', format: 'Format', exportCss: 'CSS variables', exportJson: 'JSON',
    exportHex: 'HEX list', copyDone: 'Copied to clipboard',
    note: 'Colors are grouped in OKLab, a space where distance matches how the eye sees difference. Near-identical shades merge, small accents are kept.',
    role: {
      background: 'Background', dominant: 'Dominant', accent: 'Accent', highlight: 'Highlight', dark: 'Dark',
      skin: 'Skin-like', muted: 'Muted', vibrant: 'Vibrant',
    },
  },
};

const ROLE_ORDER = ['background', 'dominant', 'accent', 'highlight', 'dark', 'skin', 'muted', 'vibrant'];
const VIBRANT_ORDER = ['Vibrant', 'LightVibrant', 'DarkVibrant', 'Muted', 'LightMuted', 'DarkMuted'];

// Чёрный или белый текст поверх свотча — по светлоте OKLab.
const inkFor = (L) => (L > 0.66 ? '#111' : '#fff');

async function vibrantSwatches(url) {
  try {
    const { Vibrant } = await import('node-vibrant/browser');
    const pal = await Vibrant.from(url).getPalette();
    return VIBRANT_ORDER.filter((k) => pal[k]).map((k) => ({ name: k, hex: pal[k].hex, pop: pal[k].population }));
  } catch {
    return [];
  }
}

function PaletteExtractor({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const dataRef = useRef(null);
  const [count, setCount] = useState(6);
  const [result, setResult] = useState(null);
  const [vib, setVib] = useState([]);
  const [preview, setPreview] = useState('');
  const [fmt, setFmt] = useState('hex');
  const [copied, setCopied] = useState('');

  function run(n = count) {
    if (dataRef.current) setResult(extractPalette(dataRef.current, n));
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      dataRef.current = imageToData(img, 256);
      setPreview(url);
      setResult(extractPalette(dataRef.current, count));
      setVib([]);
      vibrantSwatches(url).then(setVib);
    };
    img.src = url;
  }

  const val = (c) => (fmt === 'oklch' ? c.oklch : c.hex.toUpperCase());

  function copy(text, key = text) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 1200);
    }).catch(() => {});
  }

  function exportAs(kind) {
    if (!result) return;
    const roles = ROLE_ORDER.filter((r) => result.roles[r]);
    let text = '';
    if (kind === 'css') {
      text = `:root {\n${result.colors.map((c, i) => `  --color-${i + 1}: ${val(c)};`).join('\n')}\n${roles.map((r) => `  --color-${r}: ${val(result.roles[r])};`).join('\n')}\n}`;
    } else if (kind === 'json') {
      text = JSON.stringify({
        palette: result.colors.map((c) => ({ hex: c.hex, oklch: c.oklch, share: Math.round(c.pct * 10) / 10 })),
        roles: Object.fromEntries(roles.map((r) => [r, result.roles[r].hex])),
        vibrant: Object.fromEntries(vib.map((s) => [s.name, s.hex])),
      }, null, 2);
    } else {
      text = result.colors.map(val).join(fmt === 'oklch' ? '\n' : ' ');
    }
    copy(text, `export-${kind}`);
  }

  const totalPct = result ? result.colors.reduce((s, c) => s + c.pct, 0) || 1 : 1;

  return (
    <div className="tool-panel palette-extractor">
      {!preview ? (
        <button
          type="button"
          className="tool-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}
        >
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="pe-top">
            <img src={preview} alt="" className="pe-preview" />
            <div className="pe-controls">
              <div className="tool-field">
                <span className="tool-field-label">{t.count}: {count}</span>
                <input
                  type="range" min="3" max="16" step="1" value={count}
                  onChange={(e) => { const n = Number(e.target.value); setCount(n); run(n); }}
                />
              </div>
              <div className="tool-field">
                <span className="tool-field-label">{t.format}</span>
                <div className="segmented">
                  {['hex', 'oklch'].map((f) => (
                    <button key={f} type="button" className={fmt === f ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFmt(f)}>{f.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <div className="tool-actions">
                <button type="button" className="tool-btn small" onClick={() => exportAs('css')}>{copied === 'export-css' ? `✓ ${t.copyDone}` : t.exportCss}</button>
                <button type="button" className="tool-btn small" onClick={() => exportAs('json')}>{copied === 'export-json' ? `✓ ${t.copyDone}` : t.exportJson}</button>
                <button type="button" className="tool-btn small" onClick={() => exportAs('hex')}>{copied === 'export-hex' ? `✓ ${t.copyDone}` : t.exportHex}</button>
              </div>
              <button type="button" className="tool-btn small ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>

          {result && (
            <>
              <h3 className="pe-h">{t.palette}</h3>
              <div className="pe-strip" aria-hidden="true">
                {result.colors.map((c) => (
                  <span key={c.hex} style={{ background: c.hex, flexGrow: Math.max(c.pct / totalPct, 0.03) }} />
                ))}
              </div>
              <div className="pe-swatches">
                {result.colors.map((c) => (
                  <button key={c.hex} type="button" className="pe-swatch" onClick={() => copy(val(c), c.hex)} title={t.copied}>
                    <span className="pe-swatch-color" style={{ background: c.hex }} />
                    <span className="pe-swatch-hex">{copied === c.hex ? `✓ ${t.copied}` : val(c)}</span>
                    <span className="pe-swatch-pct">{c.pct < 1 ? '<1' : Math.round(c.pct)}%</span>
                  </button>
                ))}
              </div>

              <h3 className="pe-h">{t.roles}</h3>
              <div className="pe-roles">
                {ROLE_ORDER.filter((r) => result.roles[r]).map((r) => {
                  const c = result.roles[r];
                  const key = `role-${r}`;
                  return (
                    <button key={r} type="button" className="pe-role" style={{ background: c.hex, color: inkFor(c.L) }} onClick={() => copy(val(c), key)}>
                      <span className="pe-role-name">{t.role[r]}</span>
                      <span className="pe-role-val">{copied === key ? `✓ ${t.copied}` : val(c)}</span>
                    </button>
                  );
                })}
              </div>

              {vib.length > 0 && (
                <>
                  <h3 className="pe-h">{t.vibrant}</h3>
                  <div className="pe-roles">
                    {vib.map((s) => {
                      const key = `vib-${s.name}`;
                      return (
                        <button key={s.name} type="button" className="pe-role is-small" style={{ background: s.hex, color: inkFor(rgbToOklab(...hexToRgb(s.hex))[0]) }} onClick={() => copy(s.hex.toUpperCase(), key)}>
                          <span className="pe-role-name">{s.name}</span>
                          <span className="pe-role-val">{copied === key ? `✓ ${t.copied}` : s.hex.toUpperCase()}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }}
      />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default PaletteExtractor;
