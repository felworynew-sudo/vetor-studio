import { homography, invert3 } from './homography';

// Перспективная натяжка дизайна на четырёхугольник сцены (WebGL). Для каждого
// пикселя сцены обратной гомографией находим UV дизайна; края сглажены по
// производным UV. Режимы: обычный, «умножение» и «сохранить свет сцены»
// (тени, блики и фактура фона проявляются поверх дизайна).

const VERT = 'attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `#extension GL_OES_standard_derivatives : enable
precision highp float; varying vec2 v;
uniform sampler2D uScene; uniform sampler2D uDesign; uniform mat3 uHinv; uniform vec2 uSize;
uniform float uOpacity; uniform int uMode; uniform float uLight; uniform float uFit; uniform vec2 uDesignAspectFix;
void main(){
  vec4 scene = texture2D(uScene, v);
  vec2 px = vec2(v.x, 1.0 - v.y) * uSize;
  vec3 q = uHinv * vec3(px, 1.0);
  vec2 uv = q.xy / q.z;
  if (q.z <= 0.0) { gl_FragColor = scene; return; }
  // Сглаживание границы: насколько пиксель внутри [0,1]² в единицах пикселя.
  vec2 fw = max(fwidth(uv), vec2(1e-5));
  vec2 inside = min(smoothstep(vec2(0.0), fw, uv), smoothstep(vec2(0.0), fw, 1.0 - uv));
  float cover = inside.x * inside.y;
  vec2 duv = (uv - 0.5) * uDesignAspectFix + 0.5;
  vec4 d = texture2D(uDesign, vec2(duv.x, 1.0 - duv.y));
  if (duv.x < 0.0 || duv.x > 1.0 || duv.y < 0.0 || duv.y > 1.0) d = vec4(0.0);
  vec3 col = d.rgb;
  if (uMode == 1) col = d.rgb * scene.rgb;
  if (uMode == 2) {
    float l = dot(scene.rgb, vec3(0.2126, 0.7152, 0.0722));
    col = d.rgb * mix(1.0, clamp(l * 1.6, 0.0, 1.35), uLight);
  }
  float a = d.a * cover * uOpacity;
  // Альфа: прозрачный фон сцены остаётся прозрачным (для мокапов на прозрачном фоне).
  gl_FragColor = vec4(mix(scene.rgb, clamp(col, 0.0, 1.0), a), max(scene.a, a));
}`;

export function createWarp(canvas) {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) return null;
  gl.getExtension('OES_standard_derivatives');
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const mkTex = (src) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); return t;
  };
  let sceneTex = null; let designTex = null; let designAspect = 1;
  const u = (n) => gl.getUniformLocation(prog, n);
  return {
    setScene(src) { sceneTex = mkTex(src); },
    setDesign(src) { designTex = mkTex(src); designAspect = (src.naturalWidth || src.width) / (src.naturalHeight || src.height); },
    // quad — 4 точки в пикселях сцены: TL, TR, BR, BL. fit: 'stretch' | 'cover' | 'contain'.
    render(quad, { opacity = 1, mode = 2, light = 0.6, fit = 'stretch' } = {}) {
      if (!sceneTex) return;
      const W = canvas.width; const H = canvas.height;
      gl.viewport(0, 0, W, H);
      const Hm = homography([[0, 0], [1, 0], [1, 1], [0, 1]], quad);
      const inv = invert3(Hm);
      // mat3 в GLSL — по столбцам.
      gl.uniformMatrix3fv(u('uHinv'), false, [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]]);
      gl.uniform2f(u('uSize'), W, H);
      gl.uniform1f(u('uOpacity'), designTex ? opacity : 0); gl.uniform1i(u('uMode'), mode); gl.uniform1f(u('uLight'), light);
      // Соотношение сторон: длины сторон четырёхугольника приближённо дают «экранное» соотношение.
      const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
      const qa = ((len(quad[0], quad[1]) + len(quad[3], quad[2])) / 2) / ((len(quad[0], quad[3]) + len(quad[1], quad[2])) / 2 || 1);
      let fix = [1, 1];
      if (fit !== 'stretch') {
        const r = designAspect / qa;
        if (fit === 'contain') fix = r > 1 ? [1, r] : [1 / r, 1];
        else fix = r > 1 ? [1 / r, 1] : [1, r];
      }
      gl.uniform2f(u('uDesignAspectFix'), fix[0], fix[1]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex); gl.uniform1i(u('uScene'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, designTex || sceneTex); gl.uniform1i(u('uDesign'), 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}
