import { inpaint } from '../utils/inpaint';

// Воркер заливки с учётом содержимого: тяжёлый PatchMatch не блокирует вкладку.
self.onmessage = (e) => {
  const { id, rgb, mask, w, h } = e.data;
  try {
    const out = inpaint(new Float32Array(rgb), new Uint8Array(mask), w, h, { onProgress: (p) => self.postMessage({ id, progress: p }) });
    self.postMessage({ id, rgb: out.buffer }, [out.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
