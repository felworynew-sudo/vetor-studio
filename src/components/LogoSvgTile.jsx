import { useEffect, useState } from 'react';
import { withBase } from '../utils/format';

const MODE_ORDER = ['color', 'bw', 'vector'];
const MODE_LABELS = {
  ru: { color: 'В цвете', bw: 'Ч/б', vector: 'Вектор' },
  en: { color: 'Color', bw: 'B&W', vector: 'Vector' },
};

// --- SVG vector outline rendering (runs client-side only) -----------------

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
  const sw = diag * 0.004;

  const shapes = svgEl.querySelectorAll('path, polygon, polyline, rect, circle, ellipse, line');
  let outlines = '';
  shapes.forEach((el) => {
    outlines += geomToOutline(el, el.tagName.toLowerCase());
  });

  // Outlines only — anchor nodes turned the busier logos into visual mush.
  return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`
    + `<g fill="none" stroke="${accent}" stroke-width="${sw}" stroke-linejoin="round">${outlines}</g>`
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
