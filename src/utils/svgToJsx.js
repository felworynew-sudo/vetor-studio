// SVG → React-компонент в браузере (преобразования как у SVGR, но без Node-зависимостей):
// атрибуты в camelCase, style-строка → объект, class → className, иконка 1em,
// замена цветов на currentColor, {...props}, title-проп, TypeScript, memo,
// forwardRef, React Native (react-native-svg).

const KEEP = new Set(['viewBox', 'preserveAspectRatio', 'gradientUnits', 'gradientTransform', 'patternUnits', 'patternContentUnits', 'patternTransform', 'maskUnits', 'maskContentUnits', 'clipPathUnits', 'filterUnits', 'primitiveUnits', 'spreadMethod', 'stdDeviation', 'baseFrequency', 'numOctaves', 'kernelMatrix', 'textLength', 'lengthAdjust', 'startOffset', 'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'pathLength', 'tableValues', 'diffuseConstant', 'specularConstant', 'specularExponent', 'surfaceScale', 'xChannelSelector', 'yChannelSelector', 'edgeMode', 'targetX', 'targetY', 'kernelUnitLength', 'limitingConeAngle', 'pointsAtX', 'pointsAtY', 'pointsAtZ']);
const SPECIAL = { class: 'className', for: 'htmlFor', 'xlink:href': 'xlinkHref', 'xml:space': 'xmlSpace', 'xml:lang': 'xmlLang', 'xmlns:xlink': 'xmlnsXlink', tabindex: 'tabIndex' };
const camel = (s) => s.replace(/[-:]([a-z])/g, (_, c) => c.toUpperCase());
const attrName = (n) => SPECIAL[n] || (KEEP.has(n) ? n : n.startsWith('data-') || n.startsWith('aria-') ? n : camel(n));
const NATIVE = { svg: 'Svg', path: 'Path', circle: 'Circle', ellipse: 'Ellipse', rect: 'Rect', line: 'Line', polyline: 'Polyline', polygon: 'Polygon', g: 'G', text: 'Text', tspan: 'TSpan', defs: 'Defs', lineargradient: 'LinearGradient', radialgradient: 'RadialGradient', stop: 'Stop', clippath: 'ClipPath', mask: 'Mask', pattern: 'Pattern', use: 'Use', symbol: 'Symbol', image: 'Image' };

function styleObj(css) {
  const pairs = css.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':'); const k = d.slice(0, i).trim(); const v = d.slice(i + 1).trim();
    const key = k.startsWith('--') ? `'${k}'` : camel(k);
    return `${key}: ${/^-?\d+(\.\d+)?$/.test(v) && !/^(line-height|opacity|flex|z-index)$/.test(k) ? v : JSON.stringify(v)}`;
  });
  return `{{ ${pairs.join(', ')} }}`;
}

const esc = (s) => s.replace(/[{}<>]/g, (c) => `{'${c}'}`);

export function svgToComponent(svgText, opts) {
  // В react-native-svg нет <title> и размеров в em.
  const o = { ...opts, title: opts.title && !opts.native, icon: opts.icon && !opts.native };
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Некорректный SVG');
  root.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  const used = new Set();
  const colors = new Set();
  const indent = (d) => '  '.repeat(d);

  function node(el, depth) {
    if (el.nodeType === 3) { const txt = el.textContent.trim(); return txt ? `${indent(depth)}${esc(txt)}` : ''; }
    if (el.nodeType !== 1) return '';
    const raw = el.nodeName; const lower = raw.toLowerCase();
    if (lower === 'title' && el.parentNode === root && o.title) return '';
    let tag = raw;
    if (o.native) { tag = NATIVE[lower]; if (!tag) return ''; used.add(tag); }
    const attrs = [];
    const isRoot = el === root;
    [...el.attributes].forEach((a) => {
      const n = a.name; let v = a.value;
      if (isRoot && (n === 'xmlns' || n === 'xmlns:xlink' || (n === 'version'))) return;
      if (isRoot && o.icon && (n === 'width' || n === 'height')) return;
      if (o.native && (n === 'class' || n === 'style' || n.startsWith('xmlns'))) return;
      if (o.current && (n === 'fill' || n === 'stroke') && v !== 'none' && !/^url\(/.test(v)) { colors.add(v); v = 'currentColor'; }
      if (n === 'style') { attrs.push(`style=${styleObj(v)}`); return; }
      attrs.push(`${attrName(n)}=${JSON.stringify(v)}`);
    });
    if (isRoot) {
      if (o.icon) attrs.push('width="1em"', 'height="1em"');
      if (o.title) attrs.push('aria-labelledby={titleId}');
      if (o.ref && !o.native) attrs.push('ref={ref}');
      if (o.props) attrs.push('{...props}');
    }
    const kids = [...el.childNodes].map((c) => node(c, depth + 1)).filter(Boolean);
    if (isRoot && o.title) kids.unshift(`${indent(depth + 1)}{title ? <title id={titleId}>{title}</title> : null}`);
    const open = `${indent(depth)}<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}`;
    return kids.length ? `${open}>\n${kids.join('\n')}\n${indent(depth)}</${tag}>` : `${open} />`;
  }

  const name = o.name || 'Icon';
  const body = node(root, 1);
  const ts = o.typescript;
  const propsType = o.native ? 'SvgProps' : 'SVGProps<SVGSVGElement>';
  const extra = o.title ? (ts ? ' & { title?: string; titleId?: string }' : '') : '';
  const lines = [];
  const reactImports = [];
  if (o.memo) reactImports.push('memo');
  if (o.ref && !o.native) reactImports.push('forwardRef');
  if (ts && !o.native) reactImports.push('type SVGProps');
  if (ts && o.ref && !o.native) reactImports.push('type Ref');
  if (reactImports.length) lines.push(`import { ${reactImports.join(', ')} } from 'react';`);
  if (o.native) {
    const named = [...used].filter((x) => x !== 'Svg');
    if (ts) named.push('type SvgProps');
    lines.push(`import Svg${named.length ? `, { ${named.join(', ')} }` : ''} from 'react-native-svg';`);
  }
  if (lines.length) lines.push('');
  const params = o.title ? `{ title, titleId, ...props }${ts ? `: ${propsType}${extra}` : ''}` : `props${ts ? `: ${propsType}` : ''}`;
  const refParam = o.ref && !o.native ? `, ref${ts ? ': Ref<SVGSVGElement>' : ''}` : '';
  lines.push(`const ${name} = (${params}${refParam}) => (`);
  lines.push(body);
  lines.push(');');
  let exp = name;
  if (o.ref && !o.native) { lines.push(`const ForwardRef = forwardRef(${name});`); exp = 'ForwardRef'; }
  if (o.memo) { lines.push(`const Memo = memo(${exp});`); exp = 'Memo'; }
  lines.push(`export default ${exp};`);
  return { code: `${lines.join('\n')}\n`, colors: [...colors] };
}
