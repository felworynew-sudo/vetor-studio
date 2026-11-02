import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';

// QR-код: генератор (SVG/PNG, цвет и фон, включая прозрачный) + сканер (jsQR).
// Шаблоны (ссылка, Wi-Fi, контакт vCard, Telegram, почта, телефон), логотип в центре,
// форма точек и угловых меток. Готовый код сразу проверяется сканером: если стиль
// или логотип мешают чтению — инструмент предупредит. Всё локально в браузере.

const TEXT = {
  ru: {
    tabGen: 'Создать', tabScan: 'Сканировать',
    data: 'Текст или ссылка', ecc: 'Коррекция ошибок', fg: 'Цвет кода', bg: 'Фон',
    transparent: 'Прозрачный фон', dlSvg: 'Скачать SVG', dlPng: 'Скачать PNG',
    scanDrop: 'Загрузите изображение с QR-кодом', scanHint: 'PNG, JPG, WebP — распознаётся локально',
    result: 'Результат', copy: 'Копировать', copied: 'Скопировано', notFound: 'QR-код не найден на изображении',
    open: 'Открыть ссылку', hint: 'Коррекция H переживёт даже частично повреждённый код.',
    template: 'Что закодировать', tplText: 'Текст / ссылка', tplWifi: 'Wi-Fi', tplVcard: 'Контакт', tplTg: 'Telegram', tplMail: 'Почта', tplTel: 'Телефон',
    ssid: 'Название сети', password: 'Пароль', security: 'Защита', open_: 'Без пароля', hidden: 'Скрытая сеть',
    name: 'Имя', lastName: 'Фамилия', org: 'Компания', title: 'Должность', phone: 'Телефон', email: 'Почта', site: 'Сайт',
    tgUser: 'Имя пользователя или канала', mailTo: 'Кому', subject: 'Тема', body: 'Текст письма', sms: 'Открыть SMS, а не звонок', smsText: 'Текст SMS',
    style: 'Точки', square: 'Квадраты', rounded: 'Скруглённые', dots: 'Круги', corners: 'Угловые метки', circle: 'Круглые',
    cornerColor: 'Цвет меток', logo: 'Логотип', addLogo: 'Добавить логотип', removeLogo: 'Убрать', logoSize: 'Размер логотипа',
    logoEcc: 'С логотипом коррекция поднята до H.', ok: 'Код читается сканером', bad: 'Сканер не прочитал код — уменьшите логотип, выберите квадратные точки или контрастнее цвета.',
  },
  en: {
    tabGen: 'Create', tabScan: 'Scan',
    data: 'Text or link', ecc: 'Error correction', fg: 'Code color', bg: 'Background',
    transparent: 'Transparent background', dlSvg: 'Download SVG', dlPng: 'Download PNG',
    scanDrop: 'Upload an image with a QR code', scanHint: 'PNG, JPG, WebP — decoded locally',
    result: 'Result', copy: 'Copy', copied: 'Copied', notFound: 'No QR code found in the image',
    open: 'Open link', hint: 'The H level survives even a partially damaged code.',
    template: 'Content', tplText: 'Text / link', tplWifi: 'Wi-Fi', tplVcard: 'Contact', tplTg: 'Telegram', tplMail: 'Email', tplTel: 'Phone',
    ssid: 'Network name', password: 'Password', security: 'Security', open_: 'No password', hidden: 'Hidden network',
    name: 'First name', lastName: 'Last name', org: 'Company', title: 'Job title', phone: 'Phone', email: 'Email', site: 'Website',
    tgUser: 'User or channel name', mailTo: 'To', subject: 'Subject', body: 'Message', sms: 'Open SMS instead of a call', smsText: 'SMS text',
    style: 'Modules', square: 'Square', rounded: 'Rounded', dots: 'Dots', corners: 'Finder marks', circle: 'Circle',
    cornerColor: 'Mark color', logo: 'Logo', addLogo: 'Add logo', removeLogo: 'Remove', logoSize: 'Logo size',
    logoEcc: 'With a logo, error correction is raised to H.', ok: 'Scanner reads the code', bad: 'The scanner could not read the code — shrink the logo, use square modules or stronger contrast.',
  },
};

// По умолчанию библиотека берёт от символа только младший байт — кириллица и эмодзи
// превращаются в мусор. Кодируем как UTF-8: так читают все современные сканеры.
const utf8 = new TextEncoder();
qrcode.stringToBytes = (str) => Array.from(utf8.encode(str));

const ECC = ['L', 'M', 'Q', 'H'];
const MARGIN = 4;

function buildMatrix(data, ecc) {
  const qr = qrcode(0, ecc);
  qr.addData(data);
  qr.make();
  const count = qr.getModuleCount();
  return { count, isDark: (r, c) => qr.isDark(r, c) };
}

// --- Шаблоны содержимого ---
// Wi-Fi: спецсимволы \ ; , : " экранируются обратным слэшем (формат ZXing).
const wifiEsc = (v) => String(v).replace(/([\\;,:"])/g, '\\$1');
// vCard: в значениях экранируются \ , ; и переводы строк.
const vcEsc = (v) => String(v).replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n');

function payload(tpl, f) {
  switch (tpl) {
    case 'wifi':
      return `WIFI:T:${f.sec === 'nopass' ? 'nopass' : f.sec};S:${wifiEsc(f.ssid)};${f.sec === 'nopass' ? '' : `P:${wifiEsc(f.pass)};`}${f.hiddenNet ? 'H:true;' : ''};`;
    case 'vcard':
      return ['BEGIN:VCARD', 'VERSION:3.0', `N:${vcEsc(f.last)};${vcEsc(f.first)};;;`, `FN:${vcEsc(`${f.first} ${f.last}`.trim())}`,
        f.org && `ORG:${vcEsc(f.org)}`, f.jobTitle && `TITLE:${vcEsc(f.jobTitle)}`, f.phone && `TEL;TYPE=CELL:${vcEsc(f.phone)}`,
        f.email && `EMAIL:${vcEsc(f.email)}`, f.site && `URL:${vcEsc(f.site)}`, 'END:VCARD'].filter(Boolean).join('\n');
    case 'tg':
      return `https://t.me/${String(f.tg).trim().replace(/^@|^https?:\/\/t\.me\//i, '')}`;
    case 'mail': {
      const q = [f.subject && `subject=${encodeURIComponent(f.subject)}`, f.body && `body=${encodeURIComponent(f.body)}`].filter(Boolean).join('&');
      return `mailto:${String(f.mailTo).trim()}${q ? `?${q}` : ''}`;
    }
    case 'tel': {
      const num = String(f.tel).replace(/[^\d+]/g, '');
      return f.sms ? `SMSTO:${num}:${f.smsText || ''}` : `tel:${num}`;
    }
    default:
      return f.text;
  }
}

// --- Отрисовка ---
const isFinder = (r, c, n) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
const finderOrigins = (n) => [[0, 0], [0, n - 7], [n - 7, 0]];

// Модули под логотипом убираем: логотип ложится на чистое поле, остальное вытянет коррекция.
function logoBox(n, o) {
  if (!o.logo) return null;
  const side = Math.ceil(n * o.logoSize / 100) | 1; const start = Math.floor((n - side) / 2);
  return { start, end: start + side, side };
}
const underLogo = (r, c, box) => box && r >= box.start - 1 && r < box.end + 1 && c >= box.start - 1 && c < box.end + 1;

function moduleSvg(x, y, style) {
  if (style === 'dots') return `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.5"/>`;
  if (style === 'rounded') return `<rect x="${x + 0.05}" y="${y + 0.05}" width="0.9" height="0.9" rx="0.32"/>`;
  return `<rect x="${x}" y="${y}" width="1" height="1"/>`;
}

function finderSvg(x, y, style, color) {
  const r1 = { square: 0, rounded: 1.6, circle: 3.5 }[style]; const r2 = { square: 0, rounded: 0.9, circle: 1.5 }[style];
  return `<path fill="${color}" fill-rule="evenodd" d="${roundRectPath(x, y, 7, 7, r1)}${roundRectPath(x + 1, y + 1, 5, 5, Math.max(0, r1 - 1))}"/>`
    + `<path fill="${color}" d="${roundRectPath(x + 2, y + 2, 3, 3, r2)}"/>`;
}

function roundRectPath(x, y, w, h, r) {
  if (!r) return `M${x} ${y}h${w}v${h}h${-w}z`;
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

function matrixToSvg(m, o) {
  const { count: n, isDark } = m; const size = n + MARGIN * 2; const box = logoBox(n, o);
  let mods = '';
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (isDark(r, c) && !isFinder(r, c, n) && !underLogo(r, c, box)) mods += moduleSvg(c + MARGIN, r + MARGIN, o.style);
    }
  }
  const finders = finderOrigins(n).map(([r, c]) => finderSvg(c + MARGIN, r + MARGIN, o.corners, o.cornerColor)).join('');
  const bgRect = o.transparent ? '' : `<rect width="${size}" height="${size}" fill="${o.bg}"/>`;
  const logo = box ? `<image href="${o.logo}" x="${box.start + MARGIN}" y="${box.start + MARGIN}" width="${box.side}" height="${box.side}" preserveAspectRatio="xMidYMid meet"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"${o.style === 'square' ? ' shape-rendering="crispEdges"' : ''}>${bgRect}<g fill="${o.fg}">${mods}</g>${finders}${logo}</svg>`;
}

// PNG рисуется тем же способом, что и SVG: SVG → <img> → canvas.
function svgToCanvas(svg, px) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = px; c.height = px;
      c.getContext('2d').drawImage(img, 0, 0, px, px); URL.revokeObjectURL(url); resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg')); };
    img.src = url;
  });
}

function isUrl(str) {
  return /^https?:\/\//i.test(str.trim());
}

function QrTool({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [tab, setTab] = useState('gen');

  // --- Генератор ---
  const [tpl, setTpl] = useState('text');
  const [fields, setFields] = useState({
    text: 'https://vetor-studio.ru/tools', ssid: '', pass: '', sec: 'WPA', hiddenNet: false,
    first: '', last: '', org: '', jobTitle: '', phone: '', email: '', site: '',
    tg: '', mailTo: '', subject: '', body: '', tel: '', sms: false, smsText: '',
  });
  const [ecc, setEcc] = useState('M');
  const [fg, setFg] = useState('#0d0d11');
  const [bg, setBg] = useState('#ffffff');
  const [transparent, setTransparent] = useState(false);
  const [style, setStyle] = useState('square');
  const [corners, setCorners] = useState('square');
  const [cornerColor, setCornerColor] = useState('');
  const [logo, setLogo] = useState('');
  const [logoSize, setLogoSize] = useState(20);
  const [readable, setReadable] = useState(null); // true | false | null
  const logoInputRef = useRef(null);

  const setF = (k, v) => setFields((p) => ({ ...p, [k]: v }));
  const data = payload(tpl, fields);
  const level = logo ? 'H' : ecc;
  const opts = { fg, bg, transparent, style, corners, cornerColor: cornerColor || fg, logo, logoSize };

  const svg = useMemo(() => {
    if (!String(data).trim()) return '';
    try { return matrixToSvg(buildMatrix(data, level), opts); } catch { return ''; }
  }, [data, level, fg, bg, transparent, style, corners, cornerColor, logo, logoSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Самопроверка: рендерим код и читаем его тем же jsQR, что и вкладка «Сканировать».
  useEffect(() => {
    if (!svg) { setReadable(null); return undefined; }
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const c = await svgToCanvas(transparent ? svg.replace('<g ', `<rect width="100%" height="100%" fill="${bg}"/><g `) : svg, 600);
        const d = c.getContext('2d').getImageData(0, 0, 600, 600);
        const res = jsQR(d.data, 600, 600, { inversionAttempts: 'attemptBoth' });
        if (alive) setReadable(!!res && res.data === data);
      } catch { if (alive) setReadable(null); }
    }, 250);
    return () => { alive = false; clearTimeout(id); };
  }, [svg]); // eslint-disable-line react-hooks/exhaustive-deps

  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function downloadSvg() { save(new Blob([svg], { type: 'image/svg+xml' }), 'qr.svg'); }
  async function downloadPng() {
    const c = await svgToCanvas(svg, 1200);
    c.toBlob((blob) => save(blob, 'qr.png'), 'image/png');
  }

  function loadLogo(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = () => setLogo(String(r.result));
    r.readAsDataURL(file);
  }

  const input = (k, label, type = 'text') => (
    <label className="tool-field qr-field" key={k}>
      <span className="tool-field-label">{label}</span>
      <input type={type} className="qr-input" value={fields[k]} onChange={(e) => setF(k, e.target.value)} />
    </label>
  );

  // --- Сканер ---
  const scanInputRef = useRef(null);
  const [scanResult, setScanResult] = useState(null); // string | 'notfound' | null
  const [copied, setCopied] = useState(false);

  function scanFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 1000;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, canvas.width, canvas.height);
      setScanResult(code ? code.data : 'notfound');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function copyResult() {
    if (navigator.clipboard && scanResult && scanResult !== 'notfound') {
      navigator.clipboard.writeText(scanResult).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
    }
  }

  useEffect(() => { setScanResult(null); }, [tab]);

  return (
    <div className="tool-panel qr-tool">
      <div className="segmented qr-tabs">
        <button type="button" className={tab === 'gen' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTab('gen')}>{t.tabGen}</button>
        <button type="button" className={tab === 'scan' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTab('scan')}>{t.tabScan}</button>
      </div>

      {tab === 'gen' ? (
        <div className="qr-gen">
          <div className="qr-gen-left">
            <div className="tool-field">
              <span className="tool-field-label">{t.template}</span>
              <div className="segmented qr-tpls">
                {[['text', t.tplText], ['wifi', t.tplWifi], ['vcard', t.tplVcard], ['tg', t.tplTg], ['mail', t.tplMail], ['tel', t.tplTel]].map(([k, l]) => (
                  <button key={k} type="button" className={tpl === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTpl(k)}>{l}</button>
                ))}
              </div>
            </div>
            {tpl === 'text' && (
              <div className="tool-field">
                <span className="tool-field-label">{t.data}</span>
                <textarea className="qr-data" value={fields.text} onChange={(e) => setF('text', e.target.value)} rows={3} />
              </div>
            )}
            {tpl === 'wifi' && (
              <div className="qr-fields">
                {input('ssid', t.ssid)}
                <div className="tool-field qr-field">
                  <span className="tool-field-label">{t.security}</span>
                  <div className="segmented">
                    {[['WPA', 'WPA/WPA2/WPA3'], ['WEP', 'WEP'], ['nopass', t.open_]].map(([k, l]) => (
                      <button key={k} type="button" className={fields.sec === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setF('sec', k)}>{l}</button>
                    ))}
                  </div>
                </div>
                {fields.sec !== 'nopass' && input('pass', t.password)}
                <label className="wm-check"><input type="checkbox" checked={fields.hiddenNet} onChange={(e) => setF('hiddenNet', e.target.checked)} />{t.hidden}</label>
              </div>
            )}
            {tpl === 'vcard' && (
              <div className="qr-fields">
                {input('first', t.name)}{input('last', t.lastName)}{input('org', t.org)}{input('jobTitle', t.title)}
                {input('phone', t.phone, 'tel')}{input('email', t.email, 'email')}{input('site', t.site, 'url')}
              </div>
            )}
            {tpl === 'tg' && <div className="qr-fields">{input('tg', t.tgUser)}</div>}
            {tpl === 'mail' && (
              <div className="qr-fields">
                {input('mailTo', t.mailTo, 'email')}{input('subject', t.subject)}
                <label className="tool-field qr-field"><span className="tool-field-label">{t.body}</span><textarea className="qr-data" rows={2} value={fields.body} onChange={(e) => setF('body', e.target.value)} /></label>
              </div>
            )}
            {tpl === 'tel' && (
              <div className="qr-fields">
                {input('tel', t.phone, 'tel')}
                <label className="wm-check"><input type="checkbox" checked={fields.sms} onChange={(e) => setF('sms', e.target.checked)} />{t.sms}</label>
                {fields.sms && input('smsText', t.smsText)}
              </div>
            )}
            {tpl !== 'text' && <code className="qr-payload">{data}</code>}

            <div className="tool-controls">
              <div className="tool-field">
                <span className="tool-field-label">{t.ecc}</span>
                <div className="segmented">
                  {ECC.map((l) => (
                    <button key={l} type="button" disabled={!!logo} className={l === level ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setEcc(l)}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="tool-field">
                <span className="tool-field-label">{t.style}</span>
                <div className="segmented">
                  {['square', 'rounded', 'dots'].map((k) => (
                    <button key={k} type="button" className={style === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setStyle(k)}>{t[k]}</button>
                  ))}
                </div>
              </div>
              <div className="tool-field">
                <span className="tool-field-label">{t.corners}</span>
                <div className="segmented">
                  {['square', 'rounded', 'circle'].map((k) => (
                    <button key={k} type="button" className={corners === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setCorners(k)}>{t[k]}</button>
                  ))}
                </div>
              </div>
              <div className="tool-field">
                <span className="tool-field-label">{t.fg}</span>
                <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
              </div>
              <div className="tool-field">
                <span className="tool-field-label">{t.cornerColor}</span>
                <input type="color" value={cornerColor || fg} onChange={(e) => setCornerColor(e.target.value)} />
              </div>
              <div className="tool-field">
                <span className="tool-field-label">{t.bg}</span>
                <input type="color" value={bg} disabled={transparent} onChange={(e) => setBg(e.target.value)} />
              </div>
            </div>
            <div className="tool-controls">
              <div className="tool-field">
                <span className="tool-field-label">{t.logo}</span>
                <div className="tool-actions">
                  <button type="button" className="tool-btn small" onClick={() => logoInputRef.current?.click()}>🖼 {t.addLogo}</button>
                  {logo && <button type="button" className="tool-btn small ghost" onClick={() => setLogo('')}>{t.removeLogo}</button>}
                </div>
              </div>
              {logo && (
                <label className="tool-field">
                  <span className="tool-field-label">{t.logoSize}: {logoSize}%</span>
                  <input type="range" min="10" max="30" value={logoSize} onChange={(e) => setLogoSize(Number(e.target.value))} />
                </label>
              )}
              <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={(e) => { loadLogo(e.target.files[0]); e.target.value = ''; }} />
            </div>
            {logo && <p className="tool-local-note">{t.logoEcc}</p>}
            <label className="wm-check">
              <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
              {t.transparent}
            </label>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={downloadSvg} disabled={!svg}>{t.dlSvg}</button>
              <button type="button" className="tool-btn" onClick={downloadPng} disabled={!svg}>{t.dlPng}</button>
            </div>
          </div>
          <div className="qr-preview-col">
            <div className={transparent ? 'qr-preview is-transparent' : 'qr-preview'} dangerouslySetInnerHTML={{ __html: svg }} />
            {readable === true && <p className="qr-check is-ok">✓ {t.ok}</p>}
            {readable === false && <p className="qr-check is-bad">⚠ {t.bad}</p>}
          </div>
        </div>
      ) : (
        <div className="qr-scan">
          <button
            type="button"
            className="tool-dropzone"
            onClick={() => scanInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); scanFile(e.dataTransfer.files[0]); }}
          >
            <span className="tool-dropzone-title">{t.scanDrop}</span>
            <span className="tool-dropzone-hint">{t.scanHint}</span>
          </button>
          {scanResult === 'notfound' && <p className="color-invalid">{t.notFound}</p>}
          {scanResult && scanResult !== 'notfound' && (
            <div className="qr-result">
              <span className="tool-field-label">{t.result}</span>
              <code className="qr-result-code">{scanResult}</code>
              <div className="tool-actions">
                <button type="button" className="tool-btn primary" onClick={copyResult}>{copied ? `✓ ${t.copied}` : t.copy}</button>
                {isUrl(scanResult) && <a className="tool-btn" href={scanResult} target="_blank" rel="noreferrer nofollow">{t.open}</a>}
              </div>
            </div>
          )}
          <input ref={scanInputRef} type="file" accept="image/*" hidden onChange={(e) => { scanFile(e.target.files[0]); e.target.value = ''; }} />
        </div>
      )}

      <p className="tool-local-note">🔒 {t.hint}</p>
    </div>
  );
}

export default QrTool;
