import { modelFetch } from './modelMirror';

// transformers.js с загрузкой весов через зеркало (utils/modelMirror): сначала VPS,
// при сбое — HuggingFace. Кэш браузера по-прежнему по адресам HuggingFace.
let libPromise = null;
export function loadTransformers() {
  if (!libPromise) {
    libPromise = import('@huggingface/transformers').then((lib) => {
      lib.env.allowLocalModels = false;
      lib.env.fetch = modelFetch;
      return lib;
    }).catch((e) => { libPromise = null; throw e; });
  }
  return libPromise;
}
