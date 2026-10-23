// Звук эквалайзера: живая цепочка BiquadFilterNode (меняется на лету, без щелчков) и точный
// офлайн-рендер тем же набором фильтров для экспорта. Только браузер (Web Audio).

import { cascade, totalPreDb } from './eqModel.js';

export const dbToLin = (db) => 10 ** (db / 20);
// У lowpass/highpass в Web Audio добротность задаётся в дБ, у остальных — линейно.
export const nodeQ = (type, q) => (type === 'lowpass' || type === 'highpass' ? 20 * Math.log10(q) : q);

const TC = 0.02; // сглаживание параметров, с

export function createEqChain(ctx) {
  const input = ctx.createGain(); const output = ctx.createGain();
  const dry = ctx.createGain(); const wet = ctx.createGain(); const pre = ctx.createGain();
  const hp = [ctx.createBiquadFilter(), ctx.createBiquadFilter()];
  const lp = [ctx.createBiquadFilter(), ctx.createBiquadFilter()];
  const bands = Array.from({ length: 10 }, () => ctx.createBiquadFilter());
  const analyserPre = ctx.createAnalyser(); const analyserPost = ctx.createAnalyser();
  [analyserPre, analyserPost].forEach((a) => { a.fftSize = 4096; a.smoothingTimeConstant = 0.82; a.minDecibels = -100; a.maxDecibels = 0; });

  const chain = [pre, ...hp, ...lp, ...bands, wet];
  for (let i = 0; i < chain.length - 1; i += 1) chain[i].connect(chain[i + 1]);
  input.connect(pre); input.connect(dry); input.connect(analyserPre);
  wet.connect(output); dry.connect(output); output.connect(analyserPost);
  wet.gain.value = 1; dry.gain.value = 0;

  const smooth = (param, v) => param.setTargetAtTime(v, ctx.currentTime, TC);
  const neutral = (n) => { if (n.type !== 'peaking') n.type = 'peaking'; smooth(n.gain, 0); };

  function apply(model) {
    model.bands.forEach((b, i) => {
      const n = bands[i];
      if (!b.on) { neutral(n); return; }
      if (n.type !== b.type) n.type = b.type;
      smooth(n.frequency, b.f); smooth(n.Q, nodeQ(b.type, b.q)); smooth(n.gain, b.type === 'notch' ? 0 : b.gain);
    });
    const pair = (nodes, cfg, type) => nodes.forEach((n, i) => {
      if (!cfg.on) { neutral(n); return; }
      if (n.type !== type) n.type = type;
      smooth(n.frequency, cfg.f); smooth(n.Q, nodeQ(type, [0.5412, 1.3066][i]));
    });
    pair(hp, model.hp, 'highpass'); pair(lp, model.lp, 'lowpass');
    smooth(pre.gain, dbToLin(totalPreDb(model, ctx.sampleRate)));
  }

  function setBypass(on) { smooth(wet.gain, on ? 0 : 1); smooth(dry.gain, on ? 1 : 0); }

  function dispose() { [input, output, dry, wet, pre, ...hp, ...lp, ...bands, analyserPre, analyserPost].forEach((n) => { try { n.disconnect(); } catch { /* */ } }); }

  return { input, output, analyserPre, analyserPost, apply, setBypass, dispose };
}

// Рендер частями по 5 минут с разгоном 2 с (чтобы состояние фильтров устоялось): память не
// растёт вместе с длиной трека, результат тот же, что и в реальном времени.
export async function renderEq(buf, model, { onProgress, shouldCancel } = {}) {
  const sr = buf.sampleRate; const nc = buf.numberOfChannels; const len = buf.length;
  const out = Array.from({ length: nc }, () => new Float32Array(len));
  const CH = Math.round(sr * 300); const WARM = Math.round(sr * 2);
  const gain = dbToLin(totalPreDb(model, sr));
  const specs = cascade(model);
  for (let s0 = 0; s0 < len; s0 += CH) {
    if (shouldCancel?.()) throw new Error('cancelled');
    const a = Math.max(0, s0 - WARM); const b = Math.min(len, s0 + CH); const n = b - a;
    const off = new OfflineAudioContext(nc, n, sr);
    const ab = off.createBuffer(nc, n, sr);
    for (let c = 0; c < nc; c += 1) ab.copyToChannel(buf.getChannelData(c).subarray(a, b), c);
    const src = off.createBufferSource(); src.buffer = ab;
    const g = off.createGain(); g.gain.value = gain; src.connect(g);
    let node = g;
    for (const s of specs) {
      const f = off.createBiquadFilter(); f.type = s.type; f.frequency.value = s.f; f.Q.value = nodeQ(s.type, s.q); f.gain.value = s.type === 'notch' ? 0 : s.gain;
      node.connect(f); node = f;
    }
    node.connect(off.destination); src.start();
    // eslint-disable-next-line no-await-in-loop
    const rendered = await off.startRendering();
    for (let c = 0; c < nc; c += 1) out[c].set(rendered.getChannelData(c).subarray(s0 - a, s0 - a + (b - s0)), s0);
    onProgress?.(b / len);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}
