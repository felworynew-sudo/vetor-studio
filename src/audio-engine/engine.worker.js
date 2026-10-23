// Воркер аудио-движка: вся тяжёлая обработка вне основного потока.
// Протокол: { type, id, ... } → ответы { type: 'progress'|'analysis'|'profile'|'done'|'error', id, ... }

import {
  analyze, compareReport, measure, plan, profileOf, run,
} from './pipeline.js';
import { pickFragment } from './analysis.js';
import { combineProfiles } from './match.js';
import { encodeMp3, encodeWav } from './encode.js';
import { loadDfn } from './neural.js';
import {
  apolloRestore, apolloVariant, gpuInfo, hasWebGpu, loadApollo,
} from './apollo.js';

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
    if (msg.type === 'process' || msg.type === 'preview') {
      const isPreview = msg.type === 'preview';
      let { chans } = msg;
      const {
        sr, mode, opts, format,
      } = msg;
      let frag = null;
      // предпросмотр: тот же план (по анализу всего трека), но на самом динамичном фрагменте
      if (isPreview) { frag = pickFragment(chans, sr, 12); chans = chans.map((c) => c.slice(frag.start, frag.end)); }
      const a = msg.analysis || analyze(chans, sr);
      const opt = { ...opts };
      const planned = plan(a, mode, opt);
      if (planned.steps.some((s) => s.id === 'denoise' && s.engine === 'dfn')) {
        const ok = await ensureDfn();
        if (!ok) planned.steps.forEach((s) => { if (s.id === 'denoise') s.engine = 'rnnoise'; });
      }
      const warnings = [];
      let apollo = null;
      let apolloUsed = '';
      const apolloStep = planned.steps.find((x) => x.id === 'apollo');
      if (apolloStep) {
        // Выбор устройства по железу и длине трека. Глубокая нейро-реставрация идёт на
        // видеокарте (WebGPU). На процессоре Apollo считает ~45 с на секунду канала:
        // трек из часов не делаем без явного согласия — берём быстрый SBR и говорим об этом.
        const en = msg.lang === 'en';
        const pref = opts.apolloDevice || 'auto'; // auto | gpu | cpu
        const channelSec = (chans.length * chans[0].length) / sr;
        const cpuMin = Math.max(1, Math.round((channelSec * 45) / 60));
        const gpuOk = pref !== 'cpu' && (await hasWebGpu());
        const devices = [];
        if (gpuOk) devices.push('webgpu');
        if (pref === 'cpu') devices.push('wasm');
        if (!devices.length) {
          if (pref === 'gpu') warnings.push(en ? 'No usable GPU (WebGPU) — the top end was rebuilt with the fast SBR method' : 'Видеокарта (WebGPU) недоступна — верх достроен быстрым методом SBR');
          else warnings.push(en
            ? `No GPU: neural restoration on the CPU would take about ${cpuMin} min — used the fast SBR method. Pick “CPU” in the settings if you are ready to wait.`
            : `Нет видеокарты: нейро-реставрация на процессоре заняла бы около ${cpuMin} мин — использован быстрый SBR. Выберите «процессоре» в настройках, если готовы ждать.`);
        }
        for (const device of devices) {
          try {
            self.postMessage({ type: 'neural', model: 'apollo', state: 'loading', device });
            // eslint-disable-next-line no-await-in-loop
            await loadApollo(new URL('../apollo/', neuralBase).href, device);
            self.postMessage({ type: 'neural', model: 'apollo', state: 'ready', device });
            apolloSkip = false;
            const gpuName = device === 'webgpu' ? await gpuInfo() : 'CPU';
            apollo = async (c, rate, onP, extra = {}) => {
              const r = await apolloRestore(c, rate, {
                onProgress: onP, shouldStop: () => apolloSkip, cutoffHz: extra.cutoffHz, limitSec: device === 'wasm' ? Infinity : 1500,
                reload: () => loadApollo(new URL('../apollo/', neuralBase).href, device, { variant: 'fp32' }),
              });
              apolloUsed = device;
              return r;
            };
            apollo.deviceName = gpuName;
            break;
          } catch (e) {
            const why = String(e && e.message ? e.message : e);
            warnings.push(en ? `Apollo on ${device === 'webgpu' ? 'the GPU' : 'the CPU'} did not start (${why.slice(0, 160)}) — used SBR` : `Apollo на ${device === 'webgpu' ? 'видеокарте' : 'процессоре'} не запустился (${why.slice(0, 160)}) — использован SBR`);
          }
        }
        if (!apollo && devices.length) self.postMessage({ type: 'neural', model: 'apollo', state: 'failed' });
      }
      const { chans: out, log } = await run(chans, sr, planned, {
        apollo,
        apolloDevice: () => apolloUsed,
        apolloVariant: () => apolloVariant(),
        onStep: (step, i, n) => self.postMessage({ type: 'progress', id, step, i, n }),
        onProgress: (p) => self.postMessage({ type: 'progress', id, p }),
        onWarn: (w) => warnings.push(w === 'Apollo: skipped'
          ? (msg.lang === 'en' ? 'Neural restoration skipped — top end rebuilt with SBR' : 'Нейро-реставрация пропущена — верх достроен через SBR')
          : /bad-output/.test(w)
            ? (/bad-output: silent/.test(w)
              ? (msg.lang === 'en' ? `The GPU (${apollo?.deviceName || 'this device'}) returned silence for the neural model even in precise mode — used SBR instead; nothing was damaged` : `Видеокарта (${apollo?.deviceName || 'это устройство'}) вернула пустой результат нейросети даже в точном режиме — вместо неё использован SBR, трек не испорчен`)
              : (msg.lang === 'en' ? `Apollo output failed the sanity check (${w.replace(/^.*bad-output: /, '')}) on ${apollo?.deviceName || 'this device'} — used SBR instead; nothing was damaged` : `Результат Apollo не прошёл проверку (${w.replace(/^.*bad-output: /, '')}) на устройстве ${apollo?.deviceName || ''} — вместо него использован SBR, трек не испорчен`))
            : /too-slow/.test(w)
              ? (msg.lang === 'en' ? `Neural restoration would take about ${Math.round(Number(w.split(':').pop()) / 60)} min on this device — used the fast SBR method` : `Нейро-реставрация на этом устройстве заняла бы около ${Math.round(Number(w.split(':').pop()) / 60)} мин — использован быстрый SBR`)
              : w),
      });
      if (isPreview) {
        const afterM = measure(out, sr); const beforeM = measure(chans, sr);
        const report = compareReport(chans, out, sr, {
          beforeLufs: beforeM.lufs, afterLufs: afterM.lufs, beforePeak: beforeM.truePeakDb, afterPeak: afterM.truePeakDb,
        });
        self.postMessage({
          type: 'preview-done', id, kind: planned.kind, log, warnings, startSec: frag.start / sr, lenSec: (frag.end - frag.start) / sr, sr, before: chans, after: out, beforeLufs: beforeM.lufs, afterM, report,
        }, [...chans.map((c) => c.buffer), ...out.map((c) => c.buffer)]);
        return;
      }
      self.postMessage({ type: 'progress', id, step: 'encode', p: 0.99 });
      const after = measure(out, sr);
      const report = compareReport(chans, out, sr, {
        beforeLufs: a.lufs, afterLufs: after.lufs, beforePeak: a.truePeakDb, afterPeak: after.truePeakDb,
      });
      if (format === 'raw') { // сэмплы без кодирования: формат выберет основной поток (как у исходника)
        self.postMessage({
          type: 'done', id, kind: planned.kind, log, after, report, warnings, chans: out, sr,
        }, out.map((c) => c.buffer));
        return;
      }
      let bytes; let mime; let ext;
      if (format === 'mp3') { bytes = await encodeMp3(out, sr, 320); mime = 'audio/mpeg'; ext = 'mp3'; } else {
        bytes = encodeWav(out, sr, format === 'wav16' ? 16 : 24); mime = 'audio/wav'; ext = 'wav';
      }
      self.postMessage({ type: 'done', id, kind: planned.kind, log, after, report, warnings, bytes, mime, ext }, [bytes]);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id, error: String(e && e.message ? e.message : e), stack: e && e.stack });
  }
};
