import { useEffect, useState } from 'react';
import { withBase } from '../utils/format';

const MODE_ORDER = ['color', 'bw', 'vector'];
const MODE_LABELS = {
  ru: { color: 'В цвете', bw: 'Ч/б', vector: 'Вектор' },
  en: { color: 'Color', bw: 'B&W', vector: 'Vector' },
};

// --- SVG anchor-point extraction (runs client-side only) ------------------

// Parse a path `d` string into on-curve anchor points (rendered as squares,
// like a vector editor's nodes) plus Bézier control handles (hollow circles).
function parsePathAnchors(d) {
  const anchors = [];
  const handles = [];
  if (!d) return { anchors, handles };
  const tokens = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  let match;
  while ((match = re.exec(d))) {
    if (match[1]) tokens.push({ cmd: match[1] });
    else tokens.push({ num: parseFloat(match[2]) });
  }
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cmd = 'M';
  const num = () => (tokens[i] && tokens[i].num !== undefined ? tokens[i++].num : 0);
  while (i < tokens.length) {
    if (tokens[i].cmd !== undefined) {
      cmd = tokens[i].cmd;
      i += 1;
      if (cmd === 'Z' || cmd === 'z') {
        cx = sx;
        cy = sy;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'M') {
      let x = num();
      let y = num();
      if (rel) { x += cx; y += cy; }
      cx = x; cy = y; sx = x; sy = y;
      anchors.push({ x, y });
      cmd = rel ? 'l' : 'L';
    } else if (C === 'L') {
      let x = num();
      let y = num();
      if (rel) { x += cx; y += cy; }
      cx = x; cy = y;
      anchors.push({ x, y });
    } else if (C === 'H') {
      let x = num();
      if (rel) x += cx;
      cx = x;
      anchors.push({ x: cx, y: cy });
    } else if (C === 'V') {
      let y = num();
      if (rel) y += cy;
      cy = y;
      anchors.push({ x: cx, y: cy });
    } else if (C === 'C') {
      let x1 = num(); let y1 = num(); let x2 = num(); let y2 = num(); let x = num(); let y = num();
      if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
      handles.push({ x: x1, y: y1, ax: cx, ay: cy });
      handles.push({ x: x2, y: y2, ax: x, ay: y });
      cx = x; cy = y;
      anchors.push({ x, y });
    } else if (C === 'S') {
      let x2 = num(); let y2 = num(); let x = num(); let y = num();
      if (rel) { x2 += cx; y2 += cy; x += cx; y += cy; }
      handles.push({ x: x2, y: y2, ax: x, ay: y });
      cx = x; cy = y;
      anchors.push({ x, y });
    } else if (C === 'Q') {
      let x1 = num(); let y1 = num(); let x = num(); let y = num();
      if (rel) { x1 += cx; y1 += cy; x += cx; y += cy; }
      handles.push({ x: x1, y: y1, ax: cx, ay: cy });
      cx = x; cy = y;
      anchors.push({ x, y });
    } else if (C === 'T') {
      let x = num(); let y = num();
      if (rel) { x += cx; y += cy; }
      cx = x; cy = y;
      anchors.push({ x, y });
    } else if (C === 'A') {
      num(); num(); num(); num(); num();
      let x = num(); let y = num();
      if (rel) { x += cx; y += cy; }
      cx = x; cy = y;
      anchors.push({ x, y });
    } else {
      i += 1;
    }
  }
  return { anchors, handles };
}

function nums(str) {
  return (str || '').trim().split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
}

function shapeAnchors(el, tag) {
  if (tag === 'path') return parsePathAnchors(el.getAttribute('d'));
  if (tag === 'polygon' || tag === 'polyline') {
    const pts = nums(el.getAttribute('points'));
    const anchors = [];
    for (let k = 0; k + 1 < pts.length; k += 2) anchors.push({ x: pts[k], y: pts[k + 1] });
    return { anchors, handles: [] };
  }
  if (tag === 'line') {
    return {
      anchors: [
        { x: +el.getAttribute('x1'), y: +el.getAttribute('y1') },
        { x: +el.getAttribute('x2'), y: +el.getAttribute('y2') },
      ],
      handles: [],
    };
  }
  if (tag === 'rect') {
    const x = +el.getAttribute('x') || 0;
    const y = +el.getAttribute('y') || 0;
    const w = +el.getAttribute('width') || 0;
    const h = +el.getAttribute('height') || 0;
    return { anchors: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], handles: [] };
  }
  if (tag === 'circle') {
    const x = +el.getAttribute('cx') || 0;
    const y = +el.getAttribute('cy') || 0;
    const r = +el.getAttribute('r') || 0;
    return { anchors: [{ x: x + r, y }, { x, y: y + r }, { x: x - r, y }, { x, y: y - r }], handles: [] };
  }
  if (tag === 'ellipse') {
    const x = +el.getAttribute('cx') || 0;
    const y = +el.getAttribute('cy') || 0;
    const rx = +el.getAttribute('rx') || 0;
    const ry = +el.getAttribute('ry') || 0;
    return { anchors: [{ x: x + rx, y }, { x, y: y + ry }, { x: x - rx, y }, { x, y: y - ry }], handles: [] };
  }
  return { anchors: [], handles: [] };
}

function geomToOutline(el, tag) {
  if (tag === 'path') return `<path d="${el.getAttribute('d')}"/>`;
  if (tag === 'polygon') return `<polygon points="${el.getAttribute('points')}"/>`;
  if (tag === 'polyline') return `<polyline points="${el.getAttribute('points')}"/>`;
  if (tag === 'line') return `<line x1="${el.getAttribute('x1')}" y1="${el.getAttribute('y1')}" x2="${el.getAttribute('x2')}" y2="${el.getAttribute('y2')}"/>`;
  if (tag === 'rect') return `<rect x="${el.getAttribute('x') || 0}" y="${el.getAttribute('y') || 0}" width="${el.getAttribute('width') || 0}" height="${el.getAttribute('height') || 0}"/>`;
  if (tag === 'circle') return `<circle cx="${el.getAttribute('cx') || 0}" cy="${el.getAttribute('cy') || 0}" r="${el.getAttribute('r') || 0}"/>`;
  if (tag === 'ellipse') return `<ellipse cx="${el.getAttribute('cx') || 0}" cy="${el.getAttribute('cy') || 0}" rx="${el.getAttribute('rx') || 0}" ry="${el.getAttribute('ry') || 0}"/>`;
  return '';
}

function buildVectorSvg(svgEl, accent) {
  let vb = svgEl.getAttribute('viewBox');
  if (!vb) {
    const w = svgEl.getAttribute('width') || 100;
    const h = svgEl.getAttribute('height') || 100;
    vb = `0 0 ${w} ${h}`;
  }
  const [, , vw, vh] = vb.split(/[\s,]+/).map(Number);
  const diag = Math.hypot(vw || 100, vh || 100);
  const sw = diag * 0.0035;
  const aR = diag * 0.0075;
  const cR = diag * 0.0055;
  const hw = diag * 0.002;

  const shapes = svgEl.querySelectorAll('path, polygon, polyline, rect, circle, ellipse, line');
  let outlines = '';
  let anchors = [];
  let handles = [];
  shapes.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    outlines += geomToOutline(el, tag);
    const a = shapeAnchors(el, tag);
    anchors = anchors.concat(a.anchors);
    handles = handles.concat(a.handles || []);
  });

  const handleMarks = handles.map((h) => (
    `<line x1="${h.ax}" y1="${h.ay}" x2="${h.x}" y2="${h.y}" stroke="${accent}" stroke-width="${hw}" stroke-opacity="0.45"/>`
    + `<circle cx="${h.x}" cy="${h.y}" r="${cR}" fill="#fff" stroke="${accent}" stroke-width="${hw}"/>`
  )).join('');
  const anchorMarks = anchors.map((p) => (
    `<rect x="${p.x - aR}" y="${p.y - aR}" width="${aR * 2}" height="${aR * 2}" fill="${accent}"/>`
  )).join('');

  return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`
    + `<g fill="none" stroke="${accent}" stroke-width="${sw}" stroke-opacity="0.8" stroke-linejoin="round">${outlines}</g>`
    + `<g>${handleMarks}</g>`
    + `<g>${anchorMarks}</g>`
    + '</svg>';
}

// Illustrator exports carry a <style> block with generic class names
// (.cls-1, .st0, …). Inlining several such SVGs into one document makes those
// global rules collide — one logo's colors leak onto another. Prefix every
// class (in both the <style> selectors and the element class attributes) with
// a per-instance id so each inlined SVG is self-contained.
let SVG_UID = 0;
function scopeSvgStyles(svg) {
  const prefix = `lsvg${SVG_UID += 1}-`;
  svg.querySelectorAll('[class]').forEach((el) => {
    const scoped = (el.getAttribute('class') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((c) => prefix + c)
      .join(' ');
    if (scoped) el.setAttribute('class', scoped);
  });
  svg.querySelectorAll('style').forEach((st) => {
    st.textContent = (st.textContent || '').replace(/\.(-?[A-Za-z_][\w-]*)/g, `.${prefix}$1`);
  });
  return prefix;
}

function inlineSvgMarkup(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return { svg: null, markup: '' };
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  scopeSvgStyles(svg);
  return { svg, markup: svg.outerHTML };
}

function LogoSvgTile({ item, language }) {
  const cfg = item.logoSvg || {};
  const labels = MODE_LABELS[language] || MODE_LABELS.ru;
  const [mode, setMode] = useState('bw');
  const [colorMarkup, setColorMarkup] = useState('');
  const [bwMarkup, setBwMarkup] = useState('');
  const [vectorMarkup, setVectorMarkup] = useState('');
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    async function load() {
      try {
        const res = await fetch(withBase(cfg.color));
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const text = await res.text();
        const { svg, markup } = inlineSvgMarkup(text);
        if (!svg) throw new Error('no svg');
        const accent = (getComputedStyle(document.documentElement)
          .getPropertyValue('--accent') || '#ff5c63').trim() || '#ff5c63';
        const vec = buildVectorSvg(svg, accent);
        let bw = '';
        if (cfg.bw) {
          const r2 = await fetch(withBase(cfg.bw));
          if (r2.ok) bw = inlineSvgMarkup(await r2.text()).markup;
        }
        if (!alive) return;
        setColorMarkup(markup);
        setVectorMarkup(vec);
        setBwMarkup(bw);
        setStatus('ready');
      } catch {
        if (alive) setStatus('error');
      }
    }
    load();
    return () => { alive = false; };
  }, [cfg.color, cfg.bw]);

  const colorBg = cfg.colorBg || '#ffffff';
  // Vector view goes on a dark stage — the accent outline/nodes have far more
  // contrast on black than the theme's yellow-green would on white.
  let stageBg = '#ffffff';
  if (mode === 'color') stageBg = colorBg;
  else if (mode === 'vector') stageBg = '#0b0c11';

  let body = null;
  if (status === 'loading') {
    body = <div className="logo-svg-status">{language === 'ru' ? 'Загружаем логотип…' : 'Loading logo…'}</div>;
  } else if (status === 'error') {
    body = <div className="logo-svg-status">{language === 'ru' ? 'SVG не загрузился' : 'SVG failed to load'}</div>;
  } else if (mode === 'color') {
    body = <div className="logo-svg-holder" dangerouslySetInnerHTML={{ __html: colorMarkup }} />;
  } else if (mode === 'bw') {
    body = bwMarkup
      ? <div className="logo-svg-holder" dangerouslySetInnerHTML={{ __html: bwMarkup }} />
      : <div className="logo-svg-holder is-auto-black" dangerouslySetInnerHTML={{ __html: colorMarkup }} />;
  } else {
    body = <div className="logo-svg-holder" dangerouslySetInnerHTML={{ __html: vectorMarkup }} />;
  }

  return (
    <div className="logo-svg-viewer">
      <div className={`logo-svg-stage mode-${mode}`} style={{ background: stageBg }}>
        {body}
      </div>
      <div className="logo-svg-modes" role="group" aria-label={language === 'ru' ? 'Режим просмотра логотипа' : 'Logo view mode'}>
        {MODE_ORDER.map((m) => (
          <button
            key={m}
            type="button"
            className={mode === m ? 'logo-svg-mode is-active' : 'logo-svg-mode'}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
          >
            {labels[m]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default LogoSvgTile;
