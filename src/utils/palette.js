import { defaultPalette } from '../data/palette';

function normalizeHex(value, fallback) {
  const hex = String(value || '').trim();

  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return hex;
  }

  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex.slice(1).split('').map((char) => `${char}${char}`).join('')}`;
  }

  return fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex, '#000000').slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function setVariable(root, name, value) {
  root.style.setProperty(name, value);
}

export function normalizePalette(palette) {
  return Object.fromEntries(
    Object.entries(defaultPalette).map(([key, fallback]) => [key, normalizeHex(palette?.[key], fallback)]),
  );
}

export function applyPalette(palette) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const normalized = normalizePalette(palette);

  setVariable(root, '--bg', normalized.bg);
  setVariable(root, '--bg-soft', normalized.bgSoft);
  setVariable(root, '--bg-end', normalized.bgEnd);
  setVariable(root, '--surface', hexToRgba(normalized.surface, 0.88));
  setVariable(root, '--surface-strong', hexToRgba(normalized.surfaceStrong, 0.96));
  setVariable(root, '--surface-soft', hexToRgba(normalized.surfaceSoft, 0.72));
  setVariable(root, '--text', normalized.text);
  setVariable(root, '--text-muted', normalized.textMuted);
  setVariable(root, '--text-soft', normalized.textSoft);
  setVariable(root, '--accent', normalized.accent);
  setVariable(root, '--accent-soft', hexToRgba(normalized.accent, 0.18));
  setVariable(root, '--header-bg', hexToRgba(normalized.bg, 0.76));
  setVariable(root, '--orb-left', normalized.accent);
  setVariable(root, '--orb-right', normalized.orbRight);
  setVariable(root, '--orb-left-soft', hexToRgba(normalized.accent, 0.18));
  setVariable(root, '--orb-right-soft', hexToRgba(normalized.orbRight, 0.16));

  [8, 10, 12, 14, 18, 20, 22, 28, 32, 35, 42, 45, 48, 92].forEach((alpha) => {
    setVariable(root, `--accent-${alpha}`, hexToRgba(normalized.accent, alpha / 100));
  });
}
