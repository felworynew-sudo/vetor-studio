// Экспорт CSS-деклараций в разные форматы: обычный CSS и Tailwind (произвольные
// свойства вида [box-shadow:0_4px_8px_#000] — работают в Tailwind 3.2+ и 4 без конфига).
// decls: [[свойство, значение], …]

export function toCss(decls, selector = '.element') {
  return `${selector} {\n${decls.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}`;
}

const twValue = (v) => String(v).trim().replace(/_/g, '\\_').replace(/\s+/g, '_');

// Свойства с префиксом браузера (-webkit-…) опускаем: сборка Tailwind добавляет их сама.
export function toTailwind(decls) {
  return decls.filter(([p]) => !p.startsWith('-')).map(([p, v]) => `[${p}:${twValue(v)}]`).join(' ');
}
