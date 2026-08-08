/* ============================================================
   WOW MY EYES — КП «Интеграция»
   ============================================================ */
(() => {
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const printing = document.documentElement.classList.contains('printing');
const reduced  = printing || matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse   = matchMedia('(pointer: coarse)').matches;
const fine     = !printing && matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ═══════════ качество ═══════════
   Меряем реальную длительность кадров и, если телефон не вытягивает,
   сами снижаем плотность пикселей и число частиц.                   */
const Q = {
  level: coarse ? 1 : 2,
  dpr:   Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2),
  parts: coarse ? 60 : 120,
};
const QSTEP = [{dpr:1.0, parts:0}, {dpr:1.25, parts:55}, {dpr:2.0, parts:120}];
let qAcc = 0, qFrames = 0, qGood = 0, qWarm = 0, onQuality = null;
function qualityTick(raw){
  if ((qWarm += raw) < 1500) return;          /* прогрев: декодится текстура */
  if (raw > 200) { qAcc = 0; qFrames = 0; return; }   /* уход во вкладку */
  qAcc += raw/1000; qFrames++;
  if (qFrames < 45) return;
  const avg = qAcc/qFrames*1000; qAcc = 0; qFrames = 0;
  if (avg > 22 && Q.level > 0) {
    Q.level--; qGood = 0;
    const s = QSTEP[Q.level];
    Q.dpr = Math.min(Q.dpr, s.dpr); Q.parts = s.parts; onQuality?.();
  } else if (avg < 13 && Q.level < 2) {
    if (++qGood >= 3) {
      qGood = 0; Q.level++;
      const s = QSTEP[Q.level];
      Q.dpr = Math.min(devicePixelRatio || 1, s.dpr); Q.parts = s.parts; onQuality?.();
    }
  } else qGood = 0;
}

/* ─────────── 1. Заголовок по словам ─────────── */
(() => {
  const h = $('.hero__title');
  if (!h) return;
  const words = h.textContent.trim().split(/\s+/);
  h.innerHTML = words.map((w, i) => `<span class="w" style="--d:${0.28 + i*0.055}s">${w}</span>`).join(' ');
  requestAnimationFrame(() => h.classList.add('go'));
})();

/* ─────────── 2. Появление блоков ─────────── */
(() => {
  const items = $$('.reveal');
  if (printing || !('IntersectionObserver' in window)) { items.forEach(i => i.classList.add('in')); return; }
  const io = new IntersectionObserver(es => {
    es.forEach((e, i) => {
      if (!e.isIntersecting) return;
      setTimeout(() => e.target.classList.add('in'), i * 80);
      io.unobserve(e.target);
    });
  }, {threshold:.12, rootMargin:'0px 0px -8% 0px'});
  items.forEach(i => io.observe(i));
})();

/* ─────────── 3. Счётчики ─────────── */
(() => {
  const nums = $$('.count');
  if (!nums.length) return;
  const fin = el => (+el.dataset.to).toLocaleString('ru-RU');
  if (printing || reduced || !('IntersectionObserver' in window)) {
    nums.forEach(n => n.textContent = fin(n)); return;
  }
  const run = el => {
    const to = +el.dataset.to, dur = 1500, t0 = performance.now();
    const step = t => {
      const p = clamp((t - t0)/dur, 0, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1-p, 3))).toLocaleString('ru-RU');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
  }), {threshold:.6});
  nums.forEach(n => io.observe(n));
})();

/* ─────────── 4. Прогресс и точки ─────────── */
(() => {
  const bar = $('.progress i'), dots = $$('.dots a');
  const secs = dots.map(d => $(d.getAttribute('href')));
  let tick = false;
  const upd = () => {
    tick = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.width = (max > 0 ? scrollY/max*100 : 0) + '%';
    let act = 0;
    secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= innerHeight*.42) act = i; });
    dots.forEach((d, i) => d.classList.toggle('on', i === act));
  };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, {passive:true});
  addEventListener('resize', upd);
  upd();
})();

/* ─────────── 5. Параллакс ─────────── */
(() => {
  const els = $$('[data-parallax]');
  if (!els.length || reduced) return;
  let tick = false;
  const upd = () => {
    tick = false;
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) return;
      const k = (r.top + r.height/2 - innerHeight/2) / innerHeight;
      el.style.transform = `translate3d(0, ${(-k*100*+el.dataset.parallax).toFixed(2)}px, 0)`;
    });
  };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, {passive:true});
  addEventListener('resize', upd);
  upd();
})();

/* ─────────── 6. Карточки: подсветка и наклон ─────────── */
if (fine && !reduced) {
  $$('[data-tilt]').forEach(card => {
    let raf = 0, tx = 0, ty = 0;
    const apply = () => {
      raf = 0;
      card.style.transform = `perspective(1000px) rotateX(${ty}deg) rotateY(${tx}deg) translateY(-5px)`;
    };
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left)/r.width, py = (e.clientY - r.top)/r.height;
      card.style.setProperty('--px', px*100 + '%');
      card.style.setProperty('--py', py*100 + '%');
      tx = (px - .5)*5; ty = -(py - .5)*5;
      if (!raf) raf = requestAnimationFrame(apply);
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
}

/* ═══════════ 7. Радужка на WebGL ═══════════ */
const Iris = (() => {
  const cv = $('#irisGL'), fb = $('#irisFallback'), wrap = $('#irisWrap');
  const TEX = window.IRIS_TEX || 'assets/iris.webp';
  const PUPIL0 = 0.285;

  const fail = () => {
    cv?.remove();
    if (fb) { fb.src = TEX; fb.hidden = false; }
    wrap?.classList.add('no-gl');
    return null;
  };
  if (!cv || reduced) return fail();

  const gl = cv.getContext('webgl', {alpha:true, premultipliedAlpha:true, antialias:true, depth:false});
  if (!gl) return fail();

  const VS = `attribute vec2 aPos; varying vec2 vUv;
    void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

  const FS = `precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform float uPupil, uPupil0, uRot, uPx, uTime, uJolt;

    void main(){
      vec2 p = vUv*2.0 - 1.0;
      vec2 q = p;
      q.y *= 1.0 + uJolt*0.15;
      q.x *= 1.0 - uJolt*0.06;

      float r = length(q);
      if (r > 1.0 + uPx*3.0) discard;

      float a  = atan(q.y, q.x) + uRot + uJolt*0.05*sin(r*9.0);
      float rp = uPupil;

      /* зрачок расширяется анатомически верно: тянется вся строма */
      float t = clamp((r - rp) / (1.0 - rp), 0.0, 1.0);
      float k = 1.0 + (rp - uPupil0) * 1.35;
      t = pow(t, max(k, 0.35));
      float r0 = uPupil0 + t * (1.0 - uPupil0);
      r0 += sin(a*34.0 + uTime*0.25)*0.0018 + sin(a*11.0 - uTime*0.17)*0.0022;
      r0 = clamp(r0, 0.0, 1.0);

      vec2 uv = vec2(0.5) + vec2(cos(a), sin(a)) * r0 * 0.5;
      vec4 c = texture2D(uTex, uv);

      float e  = max(uPx*1.5, 0.0035);
      float pm = smoothstep(rp - e, rp + e*2.0, r);
      vec3 col = c.rgb * pm;
      col *= 0.5 + 0.5*smoothstep(rp, rp + 0.13, r);
      col += vec3(0.9,0.62,0.24) * 0.10 * (1.0-smoothstep(rp, rp+0.06, r)) * pm;
      col *= 1.0 + (uPupil0 - rp) * 0.55;

      float edge  = 1.0 - smoothstep(1.0 - uPx*2.5, 1.0, r);
      float alpha = max(c.a, 1.0 - pm) * edge;
      gl_FragColor = vec4(col * edge, alpha);
    }`;

  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return fail();
  const pr = gl.createProgram();
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return fail();
  gl.useProgram(pr);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'aPos');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = n => gl.getUniformLocation(pr, n);
  const uPupil=U('uPupil'), uRot=U('uRot'), uPx=U('uPx'), uTime=U('uTime'), uJolt=U('uJolt');
  gl.uniform1f(U('uPupil0'), PUPIL0);
  gl.uniform1i(U('uTex'), 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0,0,0,0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  let ready = false, size = 0;
  const img = new Image();
  if (!/^data:/.test(TEX)) img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      ready = true;
    } catch (e) { fail(); }
  };
  img.onerror = fail;
  img.src = TEX;

  /* геометрия — только по resize, иначе каждый кадр форсируется пересчёт раскладки */
  let geom = {w:1, cx:0, cy:0}, needMeasure = true;
  const measure = () => {
    needMeasure = false;
    const r = cv.getBoundingClientRect();
    geom = {w:r.width, cx:r.left + r.width/2, cy:r.top + r.height/2};
    const s = Math.max(1, Math.round(Math.min(r.width, r.height) * Q.dpr));
    if (s !== size) { size = s; cv.width = s; cv.height = s; gl.viewport(0,0,s,s); gl.uniform1f(uPx, 1/(s/2)); }
  };
  addEventListener('resize', () => { needMeasure = true; });
  addEventListener('orientationchange', () => { needMeasure = true; });
  addEventListener('scroll', () => { needMeasure = true; }, {passive:true});

  const st = {r:PUPIL0, v:0, light:0, lightTo:0, jolt:0};
  let lightSeen = 0;

  const draw = t => {
    if (!ready) return;
    if (needMeasure) measure();
    const T = t/1000;
    const hip = Math.sin(T*.62)*.028 + Math.sin(T*.27+1.3)*.018 + Math.sin(T*1.9)*.004;
    if (t - lightSeen > 260) st.lightTo = 0;
    st.light += (st.lightTo - st.light) * .05;
    st.jolt *= .905;
    const target = clamp(.315 + hip - st.light*.075, .13, .46);
    st.v += (target - st.r) * .045; st.v *= .80; st.r += st.v;

    gl.uniform1f(uJolt, st.jolt*Math.sin(T*33)*.9 + st.jolt*.35);
    gl.uniform1f(uPupil, st.r);
    gl.uniform1f(uRot, -T*.0122);
    gl.uniform1f(uTime, T);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  return {
    draw, geom: () => geom,
    setLight(v){ st.lightTo = clamp(v,0,1); lightSeen = performance.now(); },
    flash(v=1){ st.jolt = Math.max(st.jolt, v); },
  };
})();

/* ═══════════ 8. Пыльца, курсор, клики ═══════════ */
(() => {
  const stage = $('#irisStage'), wrap = $('#irisWrap'), canvas = $('#irisCanvas');
  if (!stage || !wrap || !canvas) return;

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, R = 0;
  const parts = [];

  /* свечение — заранее нарисованный спрайт, а не shadowBlur на каждую частицу */
  const SPRITE = {};
  (() => {
    const sz = 48;
    for (const [key, rgb] of [['warm','232,163,61'], ['cool','143,182,255']]) {
      const c = document.createElement('canvas'); c.width = c.height = sz;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(sz/2,sz/2,0, sz/2,sz/2,sz/2);
      g.addColorStop(0,`rgba(${rgb},1)`); g.addColorStop(.28,`rgba(${rgb},.55)`);
      g.addColorStop(.6,`rgba(${rgb},.14)`); g.addColorStop(1,`rgba(${rgb},0)`);
      x.fillStyle = g; x.fillRect(0,0,sz,sz);
      SPRITE[key] = c;
    }
  })();

  const resize = () => {
    const d = Math.min(Q.dpr, 1.25);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.max(1, Math.round(W*d)); canvas.height = Math.max(1, Math.round(H*d));
    ctx.setTransform(d,0,0,d,0,0);
    R = Math.min(W,H)/3;
  };
  const rnd = (a,b) => a + Math.random()*(b-a);
  const spawn = (n, burst = false) => {
    if (reduced || !Q.parts) return;
    if (burst) n = Math.round(n * Q.parts/120);
    for (let i=0;i<n;i++) parts.push({
      a: Math.random()*Math.PI*2,
      r: burst ? R*rnd(.28,.4) : R*rnd(.3,.98),
      vr: burst ? rnd(1.4,3.2) : rnd(.12,.5),
      va: rnd(-.0018,.0018), size: rnd(.7, burst?2.6:1.8),
      life: 1, decay: burst ? rnd(.006,.014) : rnd(.0022,.005),
      warm: Math.random() < .62,
    });
  };
  onQuality = () => {
    resize();
    if (parts.length > Q.parts) parts.length = Q.parts;
    if (!Q.parts) { parts.length = 0; ctx.clearRect(0,0,W,H); canvas.style.display = 'none'; }
    else canvas.style.display = '';
  };

  let running = true, last = performance.now(), hidden = false;
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden; last = performance.now(); qAcc = 0; qFrames = 0;
  });

  const frame = t => {
    const raw = t - last;
    const dt = Math.min(2.5, raw/16.67); last = t;
    requestAnimationFrame(frame);
    if (!running || hidden) return;
    qualityTick(raw);
    Iris?.draw(t);

    if (reduced || !Q.parts) return;
    ctx.clearRect(0,0,W,H);
    if (parts.length < Q.parts) spawn(2);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length-1; i>=0; i--) {
      const p = parts[i];
      p.r += p.vr*dt; p.a += p.va*dt; p.vr *= .995; p.life -= p.decay*dt;
      if (p.life <= 0 || p.r > R*1.75) { parts.splice(i,1); continue; }
      const al = p.life * (p.r > R ? clamp(1-(p.r-R)/(R*.75),0,1) : 1);
      if (al <= 0) continue;
      const rr = p.size*3.6;
      ctx.globalAlpha = al*.85;
      ctx.drawImage(p.warm ? SPRITE.warm : SPRITE.cool,
        W/2 + Math.cos(p.a)*p.r - rr, H/2 + Math.sin(p.a)*p.r - rr, rr*2, rr*2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  if (!reduced) {
    resize(); addEventListener('resize', resize);
    spawn(Math.min(70, Q.parts));
    requestAnimationFrame(t => { last = t; frame(t); });
    if ('IntersectionObserver' in window)
      new IntersectionObserver(([e]) => { running = e.isIntersecting; }, {threshold:0}).observe(stage);
  } else canvas.style.display = 'none';

  /* взгляд за курсором */
  if (fine && !reduced) {
    let raf = 0, tX = 0, tY = 0, X = 0, Y = 0;
    const loop = () => {
      X += (tX-X)*.07; Y += (tY-Y)*.07;
      wrap.style.transform = `translate3d(${X.toFixed(2)}px, ${Y.toFixed(2)}px, 0)`;
      raf = (Math.abs(tX-X) > .1 || Math.abs(tY-Y) > .1) ? requestAnimationFrame(loop) : 0;
    };
    addEventListener('pointermove', e => {
      tX = (e.clientX/innerWidth - .5)*46;
      tY = (e.clientY/innerHeight - .5)*34;
      if (Iris) {
        const g = Iris.geom();
        const d = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
        Iris.setLight(clamp(1 - d/(g.w*.85), 0, 1));
      }
      if (!raf) raf = requestAnimationFrame(loop);
    }, {passive:true});
  }

  let flinchT = 0;
  wrap.addEventListener('click', () => {
    wrap.classList.remove('pulse'); void wrap.offsetWidth; wrap.classList.add('pulse');
    Iris?.flash(1);
    spawn(150, true);
    clearTimeout(flinchT);
    flinchT = setTimeout(() => wrap.classList.remove('pulse'), 1600);
  });
  wrap.tabIndex = 0; wrap.setAttribute('role','button'); wrap.setAttribute('aria-label','Анимация радужки');

  /* радужка тускнеет при прокрутке */
  if (!reduced) {
    let tick = false;
    const upd = () => {
      tick = false;
      const p = clamp(scrollY/innerHeight, 0, 1.4);
      stage.style.setProperty('--iris-vis', clamp(1 - p*.8, 0, 1).toFixed(3));
      stage.style.scale = String(1 + p*.1);
    };
    addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, {passive:true});
  }
})();

/* ─────────── 9. Созвездие ─────────── */
(() => {
  const cv = $('#constellation');
  if (!cv || reduced) return;
  const ctx = cv.getContext('2d');
  const host = cv.parentElement;
  let W = 0, H = 0, nodes = [], running = false;
  const build = () => {
    const d = Math.min(Q.dpr, 1.5);
    const r = host.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W*d); cv.height = Math.round(H*d);
    ctx.setTransform(d,0,0,d,0,0);
    const n = clamp(Math.round(W*H/52000), 12, coarse ? 22 : 40);
    nodes = Array.from({length:n}, () => ({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-.5)*.16, vy: (Math.random()-.5)*.16,
      r: 1 + Math.random()*1.6,
    }));
  };
  const draw = () => {
    requestAnimationFrame(draw);
    if (!running) return;
    ctx.clearRect(0,0,W,H);
    for (const p of nodes) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    }
    ctx.lineWidth = 1;
    for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) {
      const a = nodes[i], b = nodes[j];
      const d = Math.hypot(a.x-b.x, a.y-b.y);
      if (d > 190) continue;
      ctx.strokeStyle = `rgba(143,182,255,${(0.16*(1-d/190)).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(232,163,61,.5)';
    for (const p of nodes) { ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.2832); ctx.fill(); }
  };
  build(); addEventListener('resize', build); requestAnimationFrame(draw);
  if ('IntersectionObserver' in window)
    new IntersectionObserver(([e]) => { running = e.isIntersecting; }, {threshold:0}).observe(host);
  else running = true;
})();

/* ═══════════ 10. Калькулятор сети ═══════════
   Цены — итог за пакет целиком на указанное число точек, не за одну зону.
   null означает «под расчёт»: такой комбинации в прайсе нет.          */
(() => {
  const box = $('#calcTariff');
  if (!box) return;

  const NET = {
    start:   {name:'Старт',    prices:[89000,  null,   null,    null,   null,   null]},
    partner: {name:'Партнёр',  prices:[149000, 195000, 280000,  365000, 450000, 540000]},
    turnkey: {name:'Под ключ', prices:[550000, null,   1250000, null,   null,   2400000]},
  };
  const LENS = [40000, 65000];      // макрообъектив на каждую фотозону

  const range = $('#calcPoints'), pointsVal = $('#calcPointsVal');
  const total = $('#calcTotal'), per = $('#calcPer'),
        save = $('#calcSave'), lens = $('#calcLens'), note = $('#calcNote');
  const btns = $$('button', box);
  let tariff = 'partner';

  const rub = n => n.toLocaleString('ru-RU') + ' ₽';

  function render(){
    const n = +range.value;
    const t = NET[tariff];
    const price = t.prices[n-1];
    pointsVal.textContent = n;

    if (price == null) {
      total.textContent = 'по запросу';
      per.textContent = '';
      save.hidden = true;
      note.hidden = false;
      note.textContent = tariff === 'start'
        ? '«Старт» рассчитан на одну точку: обучение и материалы идут на одну команду. Для сети берите «Партнёр» — там цена на несколько зон уже посчитана.'
        : `«Под ключ» на ${n} ${n < 5 ? 'точки' : 'точек'} считаем индивидуально — в пакет входит личный выезд и монтаж, а он зависит от городов и графика. В прайсе зафиксированы 1, 3 и 6 точек.`;
    } else {
      total.textContent = rub(price);
      per.textContent = `за одну фотозону — ${rub(Math.round(price/n))}`;
      note.hidden = true;
      const single = t.prices[0] * n;
      if (n > 1 && single > price) {
        save.hidden = false;
        save.textContent = `Выгода ${rub(single - price)} против ${n} отдельных пакетов — это ${Math.round((1 - price/single)*100)}%`;
      } else save.hidden = true;
    }

    lens.textContent = `${rub(LENS[0]*n)} – ${rub(LENS[1]*n)}`;
  }

  btns.forEach(b => b.addEventListener('click', () => {
    tariff = b.dataset.t;
    btns.forEach(x => x.classList.toggle('on', x === b));
    render();
  }));
  range.addEventListener('input', render);
  render();
})();

/* ═══════════ 11. Галерея гостей ═══════════ */
(() => {
  const box = $('#gallery');
  if (!box) return;
  const slides = $$('.gallery__frame img', box);
  const dotBox = $('.gallery__dots', box);
  if (slides.length < 2) { dotBox.remove(); return; }

  const DUR = 5000;
  box.style.setProperty('--dur', DUR + 'ms');

  const dots = slides.map((_, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `Фото ${i+1} из ${slides.length}`);
    b.onclick = () => { show(i); restart(); };
    dotBox.append(b); return b;
  });

  let cur = 0, timer = 0, paused = false;

  function show(i){
    cur = (i + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('on', k === cur));
    /* перезапускаем полоску прогресса: снимаем и возвращаем класс */
    dots.forEach(d => d.classList.remove('on'));
    void dots[cur].offsetWidth;
    dots[cur].classList.add('on');
    /* следующий кадр подгружаем заранее, чтобы не мигал */
    const nxt = slides[(cur + 1) % slides.length];
    if (nxt.loading === 'lazy') { nxt.loading = 'eager'; nxt.src = nxt.src; }
  }
  const restart = () => {
    clearTimeout(timer);
    if (!paused && !reduced) timer = setTimeout(() => { show(cur + 1); restart(); }, DUR);
  };

  /* пока курсор на галерее — не листаем */
  box.addEventListener('pointerenter', () => { paused = true; box.classList.add('is-paused'); clearTimeout(timer); });
  box.addEventListener('pointerleave', () => { paused = false; box.classList.remove('is-paused'); restart(); });

  $('.gallery__nav--prev', box).onclick = () => { show(cur - 1); restart(); };
  $('.gallery__nav--next', box).onclick = () => { show(cur + 1); restart(); };

  /* свайп на телефоне */
  let x0 = null;
  box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, {passive:true});
  box.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) { show(cur + (dx < 0 ? 1 : -1)); restart(); }
    x0 = null;
  }, {passive:true});

  /* крутим только когда галерея на экране и вкладка активна */
  const life = on => { if (on) restart(); else clearTimeout(timer); };
  if ('IntersectionObserver' in window)
    new IntersectionObserver(([e]) => life(e.isIntersecting), {threshold:.25}).observe(box);
  else restart();
  document.addEventListener('visibilitychange', () => life(!document.hidden));

  show(0);
})();

/* ─────────── 12. Плавные якоря ─────────── */
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const t = $(a.getAttribute('href'));
  if (!t) return;
  e.preventDefault();
  t.scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block:'start'});
}));

})();
