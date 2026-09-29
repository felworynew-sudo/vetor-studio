import { GRADE_GLSL, gradeUniforms } from './gradeMath';

// GPU-пайплайн цветокоррекции (WebGL1): размытия отдельными проходами во
// фреймбуферы (маленькое — для резкости, большое — для clarity), финальный проход:
// шумодав bilateral 5×5 → резкость → clarity → цвет (utils/gradeMath) → виньетка → зерно.

const VERT = 'attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';

const BLUR = `precision highp float; varying vec2 v; uniform sampler2D t; uniform vec2 dir;
void main(){
  vec3 c = texture2D(t, v).rgb * 0.2270270270;
  c += texture2D(t, v + dir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(t, v - dir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(t, v + dir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(t, v - dir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const FINAL = `precision highp float; varying vec2 v;
uniform sampler2D uSrc; uniform sampler2D uSmall; uniform sampler2D uLarge; uniform vec2 uTexel; uniform float uAspect;
uniform float uSharpen; uniform float uClarity; uniform float uDenoise; uniform float uVignette; uniform float uGrain; uniform float uSeed; uniform float uOriginal;
${GRADE_GLSL}
void main(){
  vec4 src = texture2D(uSrc, v);
  if (uOriginal > 0.5) { gl_FragColor = src; return; }
  vec3 c = src.rgb;
  if (uDenoise > 0.0) {
    vec3 acc = vec3(0.0); float ws = 0.0;
    float rng = 0.0015 + 0.035 * uDenoise * uDenoise;
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec3 s = texture2D(uSrc, v + vec2(float(x), float(y)) * uTexel).rgb;
        vec3 d = s - src.rgb;
        float w = exp(-float(x * x + y * y) / 4.5 - dot(d, d) / rng);
        acc += s * w; ws += w;
      }
    }
    c = mix(c, acc / ws, uDenoise);
  }
  if (uSharpen > 0.0) c += (src.rgb - texture2D(uSmall, v).rgb) * uSharpen;
  if (uClarity != 0.0) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c += (c - texture2D(uLarge, v).rgb) * uClarity * 0.9 * (1.0 - abs(l * 2.0 - 1.0));
  }
  c = gradeColor(clamp(c, 0.0, 1.0));
  if (uVignette != 0.0) {
    vec2 d = (v - 0.5) * vec2(uAspect, 1.0);
    float r = length(d) / length(vec2(uAspect, 1.0) * 0.5);
    float m = sm(0.35, 1.05, r);
    c = uVignette > 0.0 ? c * (1.0 - uVignette * m * 0.85) : mix(c, vec3(1.0), -uVignette * m * 0.6);
  }
  if (uGrain > 0.0) {
    float n = fract(sin(dot(gl_FragCoord.xy + uSeed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    c += n * uGrain;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

function compile(gl, vs, fs) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

function texture(gl, w, h, source) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return t;
}

export function maxTextureSize() {
  try { const gl = document.createElement('canvas').getContext('webgl'); return gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096; } catch { return 4096; }
}

// canvas — куда рисуем (его размер = размер результата), source — Image/Canvas того же размера.
export function createGradeRenderer(canvas, source) {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl) return null;
  const W = canvas.width; const H = canvas.height;
  const blurP = compile(gl, VERT, BLUR); const finalP = compile(gl, VERT, FINAL);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const srcTex = texture(gl, W, H, source);
  const mk = () => { const tex = texture(gl, W, H, null); const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); return { tex, fb }; };
  const tmp = mk(); const small = mk(); const large = mk();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const draw = (prog) => { const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  function blur(input, out, spacing) {
    gl.useProgram(blurP); gl.viewport(0, 0, W, H);
    gl.uniform1i(gl.getUniformLocation(blurP, 't'), 0); gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tmp.fb); gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform2f(gl.getUniformLocation(blurP, 'dir'), spacing / W, 0); draw(blurP);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb); gl.bindTexture(gl.TEXTURE_2D, tmp.tex);
    gl.uniform2f(gl.getUniformLocation(blurP, 'dir'), 0, spacing / H); draw(blurP);
  }

  let lastBlur = '';
  return {
    render(params, { original = false, seed = 0 } = {}) {
      const U = gradeUniforms(params);
      const key = `${U.sharpen > 0}|${U.clarity !== 0}`;
      if (key !== lastBlur) {
        if (U.sharpen > 0) blur(srcTex, small, 0.7);
        if (U.clarity !== 0) blur(srcTex, large, Math.max(2, Math.max(W, H) / 220));
        lastBlur = key;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(finalP);
      const u = (n) => gl.getUniformLocation(finalP, n);
      [['uSrc', srcTex], ['uSmall', small.tex], ['uLarge', large.tex]].forEach(([n, tex], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u(n), i); });
      gl.uniform2f(u('uTexel'), 1 / W, 1 / H); gl.uniform1f(u('uAspect'), W / H);
      gl.uniform1f(u('uExposure'), U.exposure); gl.uniform3fv(u('uWb'), U.wb); gl.uniform1f(u('uContrast'), U.contrast);
      gl.uniform1f(u('uHighlights'), U.highlights); gl.uniform1f(u('uShadows'), U.shadows); gl.uniform1f(u('uWhites'), U.whites); gl.uniform1f(u('uBlacks'), U.blacks);
      gl.uniform1f(u('uFade'), U.fade); gl.uniform1f(u('uSaturation'), U.saturation); gl.uniform1f(u('uVibrance'), U.vibrance);
      gl.uniform1f(u('uSharpen'), U.sharpen); gl.uniform1f(u('uClarity'), U.clarity); gl.uniform1f(u('uDenoise'), U.denoise);
      gl.uniform1f(u('uVignette'), U.vignette); gl.uniform1f(u('uGrain'), U.grain); gl.uniform1f(u('uSeed'), seed); gl.uniform1f(u('uOriginal'), original ? 1 : 0);
      draw(finalP);
    },
    dispose() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}
