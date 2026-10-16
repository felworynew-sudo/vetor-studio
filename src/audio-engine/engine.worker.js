// Воркер аудио-движка: вся тяжёлая обработка вне основного потока.
// Протокол: { type, id, ... } → ответы { type: 'progress'|'analysis'|'profile'|'done'|'error', id, ... }

import { analyze, measure, plan, profileOf, run } from './pipeline.js';
import { combineProfiles } from './match.js';
import { encodeMp3, encodeWav } from './encode.js';
import { loadDfn } from './neural.js';
import { apolloRestore, hasWebGpu, loadApollo } from './apollo.js';

let neuralBase = '';
let apolloSkip = false;
let dfnState = 'idle'; // idle | loading | ready | failed

async function ensureDfn() {
  if (dfnState === 'ready') return true;
  if (dfnState === 'failed') return false;
  dfnState = 'loading';
  self.postMessage({ type: 'neural', state: 'loading' });
  try {
    await loadDfn(neuralBase);
    dfnState = 'ready';
    self.postMessage({ type: 'neural', state: 'ready' });
    return true;
  } catch (e) {
    dfnState = 'failed';
    self.postMessage({ type: 'neural', state: 'failed', error: String(e && e.message ? e.message : e) });
    return false;
  }
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  const { id } = msg;
  try {
    if (msg.type === 'init') { neuralBase = msg.neuralBase; return; }
    if (msg.type === 'skip-apollo') { apolloSkip = true; return; }
    if (msg.type === 'analyze') {
      const a = analyze(msg.chans, msg.sr);
      self.postMessage({ type: 'analysis', id, analysis: a });
      return;
    }
    if (msg.type === 'profile') {
      const p = profileOf(msg.chans, msg.sr);
      // громкость + динамика референса: разброс (LRA) и запас пика над громкостью (PLR)
      const m = measure(msg.chans, msg.sr);
      p.lufs = m.lufs; p.lra = m.lra; p.plr = m.truePeakDb - m.lufs;
      self.postMessage({ type: 'profile', id, profile: p });
      return;
    }
    if (msg.type === 'combine') {
      const p = combineProfiles(msg.profiles);
      const avg = (key) => {
        const v = msg.profiles.map((x) => x[key]).filter(Number.isFinite);
        return v.length ? v.reduce((s, x) => s + x, 0) / v.length : undefined;
      };
      p.lufs = avg('lufs'); p.lra = avg('lra'); p.plr = avg('plr');
      self.postMessage({ type: 'combined', id, profile: p });
      return;
    }
    if (msg.type === 'process') {
      const { chans, sr, mode, opts, format } = msg;
      const a = msg.analysis || analyze(chans, sr);
      const opt = { ...opts };
      const planned = plan(a, mode, opt);
      if (planned.steps.some((s) => s.id === 'denoise' && s.engine === 'dfn')) {
        const ok = await ensureDfn();
        if (!ok) planned.steps.forEach((s) => { if (s.id === 'denoise') s.engine = 'rnnoise'; });
      }
      const warnings = [];
      let apollo = null;
      if (planned.steps.some((s) => s.id === 'apollo')) {
        // Адаптивно: видеокарта (WebGPU), если есть и не запрещена; иначе — процессор.
        const en = msg.lang === 'en';
        const pref = opts.apolloDevice || 'auto'; // auto | gpu | cpu
        const devices = [];
        if (pref !== 'cpu' && (await hasWebGpu())) devices.push('webgpu');
        if (pref !== 'gpu' || !devices.length) devices.push('wasm');
        for (const device of devices) {
          try {
            self.postMessage({ type: 'neural', model: 'apollo', state: 'loading', device });
            // eslint-disable-next-line no-await-in-loop
            await loadApollo(new URL('../apollo/', neuralBase).href, device);
            self.postMessage({ type: 'neural', model: 'apollo', state: 'ready', device });
            apolloSkip = false;
            apollo = async (c, rate, onP) => {
              const runOn = () => apolloRestore(c, rate, { onProgress: onP, shouldStop: () => apolloSkip });
              try {
                return await runOn();
              } catch (e) {
                const why = String(e && e.message ? e.message : e);
                if (why === 'skipped' || device !== 'webgpu') throw e;
                // видеокарта упала посреди счёта — пересчитываем на процессоре
                warnings.push(en ? `Apollo on the GPU failed mid-run (${why.slice(0, 160)}) — finished on the CPU` : `Apollo на видеокарте упал во время счёта (${why.slice(0, 160)}) — досчитан на процессоре`);
                self.postMessage({ type: 'neural', model: 'apollo', state: 'loading', device: 'wasm' });
                await loadApollo(new URL('../apollo/', neuralBase).href, 'wasm');
                self.postMessage({ type: 'neural', model: 'apollo', state: 'ready', device: 'wasm' });
                return runOn();
              }
            };
            break;
          } catch (e) {
            const why = String(e && e.message ? e.message : e);
            warnings.push(device === 'webgpu'
              ? (en ? `Apollo on the GPU failed (${why}) — trying the CPU` : `Apollo на видеокарте не запустился (${why}) — пробую процессор`)
              : `Apollo: ${why}`);
          }
        }
        if (!apollo) self.postMessage({ type: 'neural', model: 'apollo', state: 'failed' });
      }
      const { chans: out, log } = await run(chans, sr, planned, {
        apollo,
        onStep: (step, i, n) => self.postMessage({ type: 'progress', id, step, i, n }),
        onProgress: (p) => self.postMessage({ type: 'progress', id, p }),
        onWarn: (w) => warnings.push(w === 'Apollo: skipped'
          ? (msg.lang === 'en' ? 'Neural restoration skipped — top end rebuilt with SBR' : 'Нейро-реставрация пропущена — верх достроен через SBR')
          : w),
      });
      self.postMessage({ type: 'progress', id, step: 'encode', p: 0.99 });
      const after = measure(out, sr);
      let bytes; let mime; let ext;
      if (format === 'mp3') { bytes = await encodeMp3(out, sr, 320); mime = 'audio/mpeg'; ext = 'mp3'; } else {
        bytes = encodeWav(out, sr, format === 'wav16' ? 16 : 24); mime = 'audio/wav'; ext = 'wav';
      }
      self.postMessage({ type: 'done', id, kind: planned.kind, log, after, warnings, bytes, mime, ext }, [bytes]);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id, error: String(e && e.message ? e.message : e), stack: e && e.stack });
  }
};
