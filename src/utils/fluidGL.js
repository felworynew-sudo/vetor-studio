// Симуляция огня и дыма на GPU: «стабильные жидкости» (Stam) на WebGL2 +
// half-float текстурах. Поля: скорость (xy), скаляры (r — плотность дыма,
// g — температура). Шаг: источник → адвекция → плавучесть и ветер →
// сохранение завихрённости → проекция (дивергенция, Якоби, вычитание градиента).
// Отрисовка: температура → палитра пламени, плотность → дым; вывод
// с премультиплицированной альфой (прозрачный фон сохраняется в PNG).

const VS = `#version 300 es
in vec2 aPos; uniform vec2 texel;
out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
void main(){ vUv = aPos*0.5+0.5; vL = vUv-vec2(texel.x,0.); vR = vUv+vec2(texel.x,0.); vT = vUv+vec2(0.,texel.y); vB = vUv-vec2(0.,texel.y); gl_Position = vec4(aPos,0.,1.); }`;

const HEAD = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
`;

const FS = {
  advect: `${HEAD}uniform sampler2D vel; uniform sampler2D src; uniform vec2 texel; uniform float dt; uniform float diss;
    void main(){ vec2 c = vUv - dt*texture(vel,vUv).xy*texel; o = texture(src,c)/(1.+diss*dt); }`,
  // источник: отрезок/кольцо с шумовым мерцанием; добавляет температуру, дым и скорость вверх
  emit: `${HEAD}uniform sampler2D tgt; uniform vec2 aspect; uniform vec2 p0; uniform float halfW; uniform float rad; uniform float time;
    uniform vec4 amount; uniform float mode; uniform float isVel;
    void main(){ vec2 q = (vUv-p0)*aspect; float d;
      if (mode < .5) { d = length(vec2(max(abs(q.x)-halfW,0.), q.y)); }
      else { d = abs(length(q)-halfW); }
      float n = vnoise(vec2(vUv.x*40., time*6.)) * vnoise(vec2(vUv.x*13.+7., time*3.1));
      float side = vnoise(vec2(vUv.x*9.+3., time*4.3)) - .5;
      float m = exp(-d*d/(rad*rad)) * (0.35 + 1.3*n);
      vec4 base = texture(tgt,vUv);
      // скорость в источнике не копится, а тянется к целевой (иначе разгон без предела)
      if (isVel > .5) { vec2 dir = mode < .5 ? vec2(side*amount.z, amount.y) : normalize(q+1e-5)*amount.y; o = vec4(mix(base.xy, dir, clamp(m*.6,0.,1.)), 0., 1.); }
      else o = min(base + vec4(amount.x*m, amount.w*m, 0., 0.), vec4(3., 1.6, 0., 1.));
    }`,
  splat: `${HEAD}uniform sampler2D tgt; uniform vec2 aspect; uniform vec2 pt; uniform float rad; uniform vec4 val;
    void main(){ vec2 q=(vUv-pt)*aspect; o = texture(tgt,vUv) + val*exp(-dot(q,q)/(rad*rad)); }`,
  buoy: `${HEAD}uniform sampler2D vel; uniform sampler2D sc; uniform float dt; uniform float buoy; uniform float weight; uniform float wind;
    void main(){ vec4 s = texture(sc,vUv); vec2 v = texture(vel,vUv).xy; v += dt*25.*vec2(wind*(s.g+s.r*.5), buoy*s.g - weight*s.r); o = vec4(v,0.,1.); }`,
  curl: `${HEAD}uniform sampler2D vel;
    void main(){ float L=texture(vel,vL).y, R=texture(vel,vR).y, T=texture(vel,vT).x, B=texture(vel,vB).x; o = vec4(.5*(R-L-T+B),0.,0.,1.); }`,
  vort: `${HEAD}uniform sampler2D vel; uniform sampler2D curl; uniform float eps; uniform float dt;
    void main(){ float L=texture(curl,vL).x, R=texture(curl,vR).x, T=texture(curl,vT).x, B=texture(curl,vB).x, C=texture(curl,vUv).x;
      vec2 f = .5*vec2(abs(T)-abs(B), abs(R)-abs(L)); f /= length(f)+1e-4; f *= eps*C; f.y *= -1.;
      o = vec4(texture(vel,vUv).xy + f*dt, 0., 1.); }`,
  div: `${HEAD}uniform sampler2D vel;
    void main(){ float L=texture(vel,vL).x, R=texture(vel,vR).x, T=texture(vel,vT).y, B=texture(vel,vB).y; vec2 C=texture(vel,vUv).xy;
      if(vL.x<0.) L=-C.x; if(vR.x>1.) R=-C.x; if(vT.y>1.) T=-C.y; if(vB.y<0.) B=-C.y; o = vec4(.5*(R-L+T-B),0.,0.,1.); }`,
  press: `${HEAD}uniform sampler2D p; uniform sampler2D dv;
    void main(){ float L=texture(p,vL).x, R=texture(p,vR).x, T=texture(p,vT).x, B=texture(p,vB).x; o = vec4((L+R+B+T-texture(dv,vUv).x)*.25,0.,0.,1.); }`,
  grad: `${HEAD}uniform sampler2D p; uniform sampler2D vel;
    void main(){ float L=texture(p,vL).x, R=texture(p,vR).x, T=texture(p,vT).x, B=texture(p,vB).x; o = vec4(texture(vel,vUv).xy - vec2(R-L,T-B), 0., 1.); }`,
  scale: `${HEAD}uniform sampler2D src; uniform float k; void main(){ o = texture(src,vUv)*k; }`,
  display: `${HEAD}uniform sampler2D sc; uniform float palette; uniform float smokeOp; uniform vec3 smokeCol; uniform float fireGain; uniform vec3 bg; uniform float bgA;
    vec3 ramp(float t){ t=clamp(t,0.,1.);
      vec3 c = mix(vec3(.35,.02,0.), vec3(1.,.28,0.), smoothstep(0.,.35,t));
      c = mix(c, vec3(1.,.72,.12), smoothstep(.3,.65,t)); c = mix(c, vec3(1.,.98,.8), smoothstep(.65,1.,t)); return c; }
    void main(){ vec4 s = texture(sc,vUv); float T = s.g*fireGain; vec3 f = ramp(T);
      if (palette > 2.5) f = f.brg; else if (palette > 1.5) f = f.gbr*vec3(.8,1.,.9); else if (palette > .5) f = f.bgr;
      float fa = clamp(T*1.6,0.,1.); float sa = clamp(s.r*smokeOp,0.,1.)*(1.-fa);
      vec3 col = f*fa + smokeCol*sa; float a = fa + sa;
      col += bg*bgA*(1.-a); a = a + bgA*(1.-a);
      o = vec4(col, a); }`,
};

export function createFluid(canvas, simSize = 192) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
  gl.getExtension('OES_texture_float_linear');
  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const vs = compile(gl.VERTEX_SHADER, VS);
  const progs = {};
  Object.entries(FS).forEach(([k, src]) => {
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, src)); gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i += 1) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    progs[k] = { p, u };
  });
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  let W; let H; let fbos = {};
  const tex = (w, h) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    return { t, fb };
  };
  const dbl = (w, h) => { let a = tex(w, h); let b = tex(w, h); return { get read() { return a; }, get write() { return b; }, swap() { [a, b] = [b, a]; } }; };
  function resize() {
    const aspect = canvas.width / canvas.height;
    W = Math.round(aspect >= 1 ? simSize : simSize * aspect); H = Math.round(aspect >= 1 ? simSize / aspect : simSize);
    Object.values(fbos).forEach((f) => { [f.read, f.write, f].forEach((x) => { if (x && x.t) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.fb); } }); });
    fbos = { vel: dbl(W, H), sc: dbl(W, H), p: dbl(W, H), div: tex(W, H), curl: tex(W, H) };
  }
  resize();

  let unit = 0;
  const run = (name, target, uniforms) => {
    const { p, u } = progs[name]; gl.useProgram(p); unit = 0;
    if (u.texel) gl.uniform2f(u.texel, 1 / W, 1 / H);
    Object.entries(uniforms).forEach(([k, v]) => {
      const loc = u[k]; if (loc == null) return;
      if (v && v.t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v.t); gl.uniform1i(loc, unit); unit += 1; }
      else if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]); else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]); else gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
    });
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, W, H); } else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const aspectVec = () => [W / H, 1];

  // p — параметры (см. FIRE_DEFAULTS), splats — клики/перетаскивания мышью
  function step(p, dt, time, splats = []) {
    const { vel, sc } = fbos;
    const src = p.source; const amp = p.intensity;
    const emitCommon = { aspect: aspectVec(), p0: [src.x, src.y], halfW: src.w, rad: src.r, time, mode: src.ring ? 1 : 0 };
    if (!p.burst || (time % p.burst) < 0.25) {
      run('emit', sc.write, { ...emitCommon, tgt: sc.read, isVel: 0, amount: [p.smoke * amp * dt * 6, 0, 0, p.heat * amp * dt * 6] }); sc.swap();
      run('emit', vel.write, { ...emitCommon, tgt: vel.read, isVel: 1, amount: [0, p.lift * amp * 90, p.flicker * 160, 0] }); vel.swap();
    }
    splats.forEach((s) => {
      run('splat', vel.write, { tgt: vel.read, aspect: aspectVec(), pt: [s.x, s.y], rad: 0.03, val: [s.dx * 600, s.dy * 600, 0, 0] }); vel.swap();
      run('splat', sc.write, { tgt: sc.read, aspect: aspectVec(), pt: [s.x, s.y], rad: 0.035, val: [p.smoke * 0.4, p.heat * 0.7, 0, 0] }); sc.swap();
    });
    run('advect', vel.write, { vel: vel.read, src: vel.read, dt, diss: p.velDiss }); vel.swap();
    run('advect', sc.write, { vel: vel.read, src: sc.read, dt, diss: 0 }); sc.swap();
    // остывание и рассеивание дыма — разные скорости: масштабируем каналы
    run('buoy', vel.write, { vel: vel.read, sc: sc.read, dt, buoy: p.buoyancy, weight: p.weight, wind: p.wind }); vel.swap();
    run('curl', fbos.curl, { vel: vel.read });
    run('vort', vel.write, { vel: vel.read, curl: fbos.curl, eps: p.vorticity, dt }); vel.swap();
    run('div', fbos.div, { vel: vel.read });
    run('scale', fbos.p.write, { src: fbos.p.read, k: 0.8 }); fbos.p.swap();
    for (let i = 0; i < 24; i += 1) { run('press', fbos.p.write, { p: fbos.p.read, dv: fbos.div }); fbos.p.swap(); }
    run('grad', vel.write, { p: fbos.p.read, vel: vel.read }); vel.swap();
    cool(p, dt);
  }
  // Остывание (g) и рассеивание дыма (r) — отдельным проходом через «scale» по каналам
  const coolProg = (() => {
    // у краёв кадра газ «уходит» (иначе он копится под верхней стенкой)
    const src = `${HEAD}uniform sampler2D src; uniform vec2 k; void main(){ vec4 s = texture(src,vUv);
      float edge = smoothstep(0., .12, 1.-vUv.y) * smoothstep(0., .04, vUv.x) * smoothstep(0., .04, 1.-vUv.x);
      float f = mix(.9, 1., edge); o = vec4(s.r*k.x*f, s.g*k.y*f, 0., 1.); }`;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, src)); gl.bindAttribLocation(pr, 0, 'aPos'); gl.linkProgram(pr);
    progs.cool = { p: pr, u: { src: gl.getUniformLocation(pr, 'src'), k: gl.getUniformLocation(pr, 'k'), texel: gl.getUniformLocation(pr, 'texel') } };
    return true;
  })();
  function cool(p, dt) {
    if (!coolProg) return;
    run('cool', fbos.sc.write, { src: fbos.sc.read, k: [Math.exp(-p.smokeDiss * dt), Math.exp(-p.cooling * dt)] }); fbos.sc.swap();
  }

  function render(p, bg) {
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    run('display', null, {
      sc: fbos.sc.read, palette: { fire: 0, blue: 1, green: 2, purple: 3 }[p.palette] || 0, smokeOp: p.smokeOpacity,
      smokeCol: hex(p.smokeColor), fireGain: p.fireGain, bg: bg === 'transparent' ? [0, 0, 0] : hex(bg), bgA: bg === 'transparent' ? 0 : 1,
    });
  }

  function reset() { resize(); }
  // Контекст не теряем (холст переиспользуется при пересоздании) — только чистим ресурсы.
  function dispose() {
    Object.values(fbos).forEach((f) => { [f.read, f.write, f].forEach((x) => { if (x && x.t) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.fb); } }); });
    Object.values(progs).forEach(({ p }) => gl.deleteProgram(p)); gl.deleteBuffer(buf); fbos = {};
  }
  return { step, render, reset, resize, dispose };
}

export const FIRE_DEFAULTS = {
  source: { x: 0.5, y: 0.08, w: 0.12, r: 0.035, ring: false },
  intensity: 1, heat: 1, smoke: 0.35, lift: 1, flicker: 1, buoyancy: 9, weight: 1.5, wind: 0, vorticity: 22,
  cooling: 1.1, smokeDiss: 0.35, velDiss: 0.2, burst: 0, palette: 'fire', smokeOpacity: 1.1, smokeColor: '#3a3a3f', fireGain: 1,
};

export const FIRE_PRESETS = [
  { id: 'campfire', ru: 'Костёр', en: 'Campfire', p: {} },
  { id: 'candle', ru: 'Свеча', en: 'Candle', p: { source: { x: 0.5, y: 0.15, w: 0.008, r: 0.022, ring: false }, heat: 2.5, intensity: 1.6, smoke: 0.04, vorticity: 5, flicker: 0.25, cooling: 1.6, buoyancy: 10, fireGain: 1.3 } },
  { id: 'torch', ru: 'Факел', en: 'Torch', p: { source: { x: 0.5, y: 0.1, w: 0.04, r: 0.03, ring: false }, heat: 1.4, buoyancy: 14, vorticity: 30, cooling: 1.4, smoke: 0.25 } },
  { id: 'inferno', ru: 'Пожар', en: 'Inferno', p: { source: { x: 0.5, y: 0.05, w: 0.4, r: 0.045, ring: false }, heat: 1.1, intensity: 1, vorticity: 34, smoke: 0.5, cooling: 1.5, smokeDiss: 0.5 } },
  { id: 'smoke', ru: 'Дым', en: 'Smoke', p: { heat: 0.25, smoke: 1.4, vorticity: 14, buoyancy: 7, weight: 0.4, smokeDiss: 0.12, fireGain: 0.2, smokeColor: '#8a8a92' } },
  { id: 'magic', ru: 'Магический', en: 'Magic', p: { palette: 'blue', smoke: 0.1, vorticity: 28, source: { x: 0.5, y: 0.1, w: 0.08, r: 0.03, ring: false } } },
  { id: 'burst', ru: 'Взрывы', en: 'Bursts', p: { source: { x: 0.5, y: 0.35, w: 0.02, r: 0.05, ring: true }, burst: 2.2, intensity: 3, heat: 1.6, smoke: 0.9, lift: 1.4, vorticity: 26, cooling: 1.2 } },
];
