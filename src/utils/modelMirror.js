// Зеркало моделей на своём VPS (api.vetor-studio.ru/models/) с откатом на оригинал.
//
// Порядок для каждого файла модели:
//   1) файл есть в манифесте src/data/model-mirror.json → качаем с зеркала;
//   2) зеркало не ответило, вернуло ошибку, оборвалось или хэш не совпал → оригинал:
//      свои модели — с GitHub Pages (vetor-studio.ru/models/…), чужие — с HuggingFace / Google.
//
// Безопасность: SHA-256 и размер каждого файла зашиты в сборку сайта (её публикует GitHub),
// поэтому подменённый на VPS файл не будет использован — проверка не сойдётся, и загрузка
// уйдёт на оригинал. Ключи кэша браузера остаются прежними (оригинальные URL).
// Модуль без DOM: работает и в воркерах.

import manifest from '../data/model-mirror.json';
import { createSha256 } from './sha256';

const MIRROR = manifest.base;
const FILES = manifest.files || {};
const HEADERS_TIMEOUT = 10000; // нет ответа за 10 с — идём на оригинал
const STALL_TIMEOUT = 30000; // поток встал на 30 с — считаем зеркало упавшим

let mirrorDown = false; // после первого сбоя в этой вкладке/воркере зеркало больше не трогаем
let failures = 0;

export class MirrorError extends Error {
  constructor(message) { super(message); this.name = 'MirrorError'; }
}

function here() {
  try { return self.location.href; } catch { return 'https://vetor-studio.ru/'; }
}

// Ключ файла в манифесте по его оригинальному адресу (или null, если зеркала для него нет).
export function mirrorKey(input) {
  let u;
  try { u = new URL(String(input), here()); } catch { return null; }
  const path = decodeURIComponent(u.pathname);
  if (path.includes('..')) return null;
  if (u.hostname === 'huggingface.co') {
    const m = path.match(/^\/([^/]+\/[^/]+)\/resolve\/main\/(.+)$/);
    return m ? `hf/${m[1]}/${m[2]}` : null;
  }
  if (u.hostname === 'storage.googleapis.com' && path.startsWith('/mediapipe-models/')) {
    return `ext/${path.slice(1)}`;
  }
  const own = u.origin === new URL(here()).origin || u.hostname === 'vetor-studio.ru';
  if (own && path.startsWith('/models/')) return `site/${path.slice('/models/'.length)}`;
  return null;
}

export function mirrorFailures() { return failures; }

function fail(reason) {
  mirrorDown = true; failures += 1;
  try { console.warn(`[models] зеркало недоступно (${reason}) — качаем с оригинала`); } catch { /* */ }
}

// Поток, который отдаёт байты сразу (прогресс загрузки живой), а в конце сверяет размер
// и SHA-256. Несовпадение — ошибка потока: файл не попадёт в кэш, а загрузчик повторит
// попытку уже с оригинала (см. withMirrorRetry).
function verified(body, entry, key) {
  const hash = createSha256(); let got = 0;
  const reader = body.getReader();
  return new ReadableStream({
    async pull(controller) {
      let timer;
      try {
        const stall = new Promise((_, rej) => { timer = setTimeout(() => rej(new MirrorError('stall')), STALL_TIMEOUT); });
        const { done, value } = await Promise.race([reader.read(), stall]);
        clearTimeout(timer);
        if (done) {
          if (got !== entry.size) throw new MirrorError(`size ${got} ≠ ${entry.size}`);
          if (hash.hex() !== entry.sha256) throw new MirrorError('sha256 mismatch');
          controller.close();
          return;
        }
        got += value.length;
        if (got > entry.size) throw new MirrorError('too large');
        hash.update(value);
        controller.enqueue(value);
      } catch (e) {
        clearTimeout(timer);
        try { reader.cancel(); } catch { /* */ }
        fail(`${key}: ${e.message}`);
        controller.error(e instanceof MirrorError ? e : new MirrorError(String(e?.message || e)));
      }
    },
    cancel(reason) { try { reader.cancel(reason); } catch { /* */ } },
  });
}

// Замена fetch для файлов моделей. Range/HEAD/POST и всё, чего нет в манифесте, идёт как есть.
export async function modelFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : (input?.url || String(input));
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  const key = mirrorKey(url);
  const entry = key && FILES[key];
  if (!entry || mirrorDown || !MIRROR || method !== 'GET' || headers.has('range')) return fetch(input, init);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEADERS_TIMEOUT);
  let res;
  try {
    res = await fetch(MIRROR + key.split('/').map(encodeURIComponent).join('/'), {
      mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer); fail(`${key}: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    return fetch(input, init);
  }
  clearTimeout(timer);
  const len = Number(res.headers.get('content-length'));
  if (!res.ok || !res.body || (len && len !== entry.size)) {
    try { res.body?.cancel(); } catch { /* */ }
    fail(`${key}: HTTP ${res.status}`);
    return fetch(input, init);
  }
  return new Response(verified(res.body, entry, key), {
    status: 200,
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(entry.size) },
  });
}

// Загрузку, которая оборвалась на зеркале посреди потока, повторяем один раз — уже с оригинала.
export async function withMirrorRetry(fn) {
  const before = failures;
  try {
    return await fn();
  } catch (e) {
    if (failures === before) throw e;
    return fn();
  }
}
