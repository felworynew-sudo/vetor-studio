// Воркер аудио-движка: вся тяжёлая обработка вне основного потока.
// Протокол: { type, id, ... } → ответы { type: 'progress'|'analysis'|'profile'|'done'|'error', id, ... }

import { analyze, measure, plan, profileOf, run } from './pipeline.js';
import { combineProfiles } from './match.js';
import { integratedLufs } from './analysis.js';
import { encodeMp3, encodeWav } from './encode.js';
import { loadDfn } from './neural.js';

let neuralBase = '';
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
    if (msg.type === 'analyze') {
      const a = analyze(msg.chans, msg.sr);
      self.postMessage({ type: 'analysis', id, analysis: a });
      return;
    }
    if (msg.type === 'profile') {
      const p = profileOf(msg.chans, msg.sr);
      p.lufs = integratedLufs(msg.chans, msg.sr);
      self.postMessage({ type: 'profile', id, profile: p });
      return;
    }
    if (msg.type === 'combine') {
      const p = combineProfiles(msg.profiles);
      const ls = msg.profiles.map((x) => x.lufs).filter(Number.isFinite);
      p.lufs = ls.length ? ls.reduce((s, v) => s + v, 0) / ls.length : undefined;
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
      const { chans: out, log } = await run(chans, sr, planned, {
        onStep: (step, i, n) => self.postMessage({ type: 'progress', id, step, i, n }),
        onProgress: (p) => self.postMessage({ type: 'progress', id, p }),
        onWarn: (w) => warnings.push(w),
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
