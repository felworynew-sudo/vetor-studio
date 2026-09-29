// Стек ретро-эффектов на GPU (WebGL1): один фрагментный шейдер, каждый эффект
// выключен при силе 0. CRT, глитч, VHS, печать (риз/офсет), плёнка. Параметр
// времени даёт анимацию (дрожание, трекинг, зерно, мерцание).

export const FX_DEFAULTS = {
  curvature: 0, scanlines: 0, scanDensity: 1, mask: 0, glow: 0, vignette: 0, flicker: 0,
  rgbShift: 0, rgbAngle: 0, blocks: 0, blockSize: 0.5,
  jitter: 0, tracking: 0, chromaBlur: 0, tapeNoise: 0, bleed: 0,
  misreg: 0, paperGrain: 0, posterize: 0, paper: 0,
  grain: 0, scratches: 0, leak: 0,
  saturation: 1, contrast: 1, brightness: 0,
};

const VERT = 'attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';

const FRAG = `precision highp float; varying vec2 v;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime; uniform float uSeed;
uniform float uCurv, uScan, uScanDen, uMask, uGlow, uVig, uFlick;
uniform float uShift, uAngle, uBlocks, uBlockSize;
uniform float uJitter, uTrack, uChroma, uTape, uBleed;
uniform float uMisreg, uPaperGrain, uPoster, uPaper;
uniform float uGrain, uScratch, uLeak;
uniform float uSat, uCon, uBri;
float h1(float n){ return fract(sin(n * 127.1 + uSeed) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
vec3 samp(vec2 uv){ return texture2D(uTex, clamp(uv, 0.0, 1.0)).rgb; }
vec3 toYiq(vec3 c){ return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312))); }
vec3 fromYiq(vec3 c){ return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z); }
void main(){
  vec2 uv = vec2(v.x, 1.0 - v.y);
  // CRT: бочкообразное искажение.
  if (uCurv > 0.0) { vec2 c = uv * 2.0 - 1.0; c *= 1.0 + dot(c, c) * uCurv * 0.25; uv = c * 0.5 + 0.5; if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; } }
  float line = floor(uv.y * uRes.y);
  // VHS: дрожание строк и полоса трекинга.
  if (uJitter > 0.0) uv.x += (h1(line + floor(uTime * 30.0) * 7.0) - 0.5) * uJitter * 0.01;
  if (uTrack > 0.0) { float band = fract(uTime * 0.12 + uSeed * 0.1); float d = abs(uv.y - band); if (d < 0.06) uv.x += (n2(vec2(uv.y * 80.0, uTime * 10.0)) - 0.5) * uTrack * 0.06 * (1.0 - d / 0.06); }
  // Глитч: горизонтальные блоки со сдвигом.
  if (uBlocks > 0.0) { float bs = mix(4.0, 40.0, uBlockSize); vec2 cell = floor(vec2(uv.x * 3.0, uv.y * bs)); float r = h2(cell + floor(uTime * 8.0)); if (r < uBlocks * 0.35) uv.x += (h2(cell + 3.1) - 0.5) * 0.2 * uBlocks; }
  // Цвет с RGB-сдвигом / несовмещением печатных форм.
  vec2 dir = vec2(cos(radians(uAngle)), sin(radians(uAngle))) / uRes * uShift;
  vec3 col = vec3(samp(uv + dir).r, samp(uv).g, samp(uv - dir).b);
  if (uMisreg > 0.0) { vec2 m = vec2(uMisreg) / uRes; vec3 cmy = 1.0 - vec3(samp(uv + m * vec2(1.0, 0.4)).r, samp(uv - m * vec2(0.3, 1.0)).g, samp(uv + m * vec2(-0.8, 0.6)).b); col = 1.0 - cmy; }
  // VHS: размытый хром (цветность «плывёт» по горизонтали) и растекание.
  if (uChroma > 0.0 || uBleed > 0.0) {
    vec3 y = toYiq(col); vec2 acc = vec2(0.0); float w = 0.0;
    for (int i = -6; i <= 6; i++) { float fi = float(i); vec2 o = vec2(fi * uChroma * 1.5 + uBleed * 3.0, 0.0) / uRes; float k = exp(-fi * fi / 18.0); acc += toYiq(samp(uv + o)).yz * k; w += k; }
    col = fromYiq(vec3(y.x, acc / w));
  }
  // Свечение (дешёвый bloom по соседям).
  if (uGlow > 0.0) { vec3 g = vec3(0.0); for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; g += samp(uv + vec2(cos(a), sin(a)) * 4.0 / uRes); } g /= 8.0; col += max(g - 0.55, 0.0) * uGlow * 1.8; }
  // Тон.
  col = (col - 0.5) * uCon + 0.5 + uBri;
  float lum = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(lum), col, uSat);
  if (uPoster > 0.0) { float lv = mix(24.0, 3.0, uPoster); col = floor(col * lv + 0.5) / lv; }
  // CRT: скан-линии, маска кинескопа, мерцание.
  if (uScan > 0.0) { float s = sin(uv.y * uRes.y * 3.14159 * uScanDen * 0.5); col *= 1.0 - uScan * 0.55 * (0.5 - 0.5 * s); }
  if (uMask > 0.0) { float mx = mod(floor(uv.x * uRes.x), 3.0); vec3 m = mx < 1.0 ? vec3(1.0, 0.7, 0.7) : mx < 2.0 ? vec3(0.7, 1.0, 0.7) : vec3(0.7, 0.7, 1.0); col *= mix(vec3(1.0), m * 1.15, uMask); }
  if (uFlick > 0.0) col *= 1.0 - uFlick * 0.08 * h1(floor(uTime * 24.0));
  // VHS: помехи ленты — светлые штрихи.
  if (uTape > 0.0) { float r = h2(vec2(floor(uv.y * uRes.y / 2.0), floor(uTime * 24.0))); if (r > 1.0 - uTape * 0.03) { float x = h2(vec2(r, 1.0)); col += smoothstep(0.02, 0.0, abs(uv.x - x) * 0.5) * 0.8; } }
  // Плёнка: зерно, царапины, засветка.
  if (uGrain > 0.0) col += (h2(uv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain * 0.35;
  if (uScratch > 0.0) { float sx = h1(floor(uTime * 12.0)); if (abs(uv.x - sx) < 0.0015 && h1(floor(uTime * 12.0) + 5.0) < uScratch) col = mix(col, vec3(0.95), 0.6); if (h2(floor(uv * uRes / 3.0) + floor(uTime * 12.0)) > 1.0 - uScratch * 0.004) col *= 0.2; }
  if (uLeak > 0.0) { vec2 c = uv - vec2(0.95, 0.1); col += vec3(1.0, 0.45, 0.15) * uLeak * exp(-dot(c, c) * 6.0) * 0.9; }
  // Печать: зерно бумаги и тёплая бумага.
  if (uPaperGrain > 0.0) col *= 1.0 - (n2(uv * uRes / 2.5) - 0.5) * uPaperGrain * 0.35;
  if (uPaper > 0.0) col = mix(col, col * vec3(0.98, 0.95, 0.86) + vec3(0.02, 0.02, 0.0), uPaper);
  if (uVig > 0.0) { vec2 c = uv - 0.5; col *= 1.0 - dot(c, c) * uVig * 2.2; }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export function createFx(canvas, source) {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (tp, s) => { const o = gl.createShader(tp); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // uv в шейдере уже «сверху вниз»
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  const u = (n) => gl.getUniformLocation(prog, n);
  const map = {
    uCurv: 'curvature', uScan: 'scanlines', uScanDen: 'scanDensity', uMask: 'mask', uGlow: 'glow', uVig: 'vignette', uFlick: 'flicker',
    uShift: 'rgbShift', uAngle: 'rgbAngle', uBlocks: 'blocks', uBlockSize: 'blockSize', uJitter: 'jitter', uTrack: 'tracking', uChroma: 'chromaBlur', uTape: 'tapeNoise', uBleed: 'bleed',
    uMisreg: 'misreg', uPaperGrain: 'paperGrain', uPoster: 'posterize', uPaper: 'paper', uGrain: 'grain', uScratch: 'scratches', uLeak: 'leak', uSat: 'saturation', uCon: 'contrast', uBri: 'brightness',
  };
  return {
    render(p, time = 0, seed = 1) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u('uRes'), canvas.width, canvas.height); gl.uniform1f(u('uTime'), time); gl.uniform1f(u('uSeed'), seed);
      Object.entries(map).forEach(([un, key]) => gl.uniform1f(u(un), p[key] ?? FX_DEFAULTS[key]));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}

export const FX_PRESETS = [
  { id: 'vhs', ru: 'VHS 1989', en: 'VHS 1989', p: { jitter: 0.35, tracking: 0.5, chromaBlur: 0.6, tapeNoise: 0.5, bleed: 0.4, saturation: 1.25, contrast: 1.05, scanlines: 0.15, vignette: 0.35, grain: 0.15 }, stamp: true },
  { id: 'crt', ru: 'CRT-монитор', en: 'CRT monitor', p: { curvature: 0.6, scanlines: 0.6, scanDensity: 1, mask: 0.45, glow: 0.5, vignette: 0.5, flicker: 0.3, rgbShift: 1 } },
  { id: 'arcade', ru: 'Аркадный автомат', en: 'Arcade', p: { curvature: 0.35, scanlines: 0.8, scanDensity: 0.7, mask: 0.6, glow: 0.9, saturation: 1.4, contrast: 1.15, vignette: 0.6 } },
  { id: 'glitch', ru: 'Глитч-арт', en: 'Glitch art', p: { rgbShift: 8, rgbAngle: 0, blocks: 0.6, blockSize: 0.6, jitter: 0.4, tapeNoise: 0.3, saturation: 1.2 } },
  { id: 'riso', ru: 'Ризограф', en: 'Riso print', p: { misreg: 3, paperGrain: 0.7, posterize: 0.55, paper: 0.8, grain: 0.1, contrast: 1.1 } },
  { id: 'film', ru: 'Старая плёнка', en: 'Old film', p: { grain: 0.5, scratches: 0.5, leak: 0.5, vignette: 0.7, saturation: 0.75, contrast: 1.1, flicker: 0.5 } },
];
