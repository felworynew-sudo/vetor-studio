// Воркер векторизации VTracer (visioncortex, MIT/Apache-2.0).
// npm-пакет собран под Node (wasm читается через fs), поэтому берём его glue-код
// как текст и подставляем байты wasm, загруженные по URL. В воркере синхронная
// компиляция WebAssembly.Module разрешена, а тяжёлая трассировка не вешает вкладку.
import glueSrc from '@visioncortex/vtracer/pkg/vtracer_wasm.js?raw';
import wasmUrl from '@visioncortex/vtracer/pkg/vtracer_wasm_bg.wasm?url';

let api = null;
async function load() {
  if (api) return api;
  const bytes = new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
  const src = glueSrc
    .replace(/const wasmPath = [^\n]*\n/, '')
    .replace(/const wasmBytes = require\('fs'\)\.readFileSync\(wasmPath\);/, 'const wasmBytes = __WASM_BYTES__;');
  const exp = {};
  // eslint-disable-next-line no-new-func
  new Function('exports', '__WASM_BYTES__', 'module', src)(exp, bytes, { exports: exp });
  api = exp;
  return api;
}

self.onmessage = async (e) => {
  const { id, rgba, width, height, options } = e.data;
  try {
    const vt = await load();
    const t0 = performance.now();
    const svg = vt.vectorize_rgba(new Uint8Array(rgba), width, height, options);
    self.postMessage({ id, svg, ms: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
