// Подсказки о поддержке браузера для AI-инструментов (transformers.js/ONNX).
// В Safari ONNX-рантайм часто не работает — советуем Chromium.

export function isSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /^((?!chrome|chromium|android|crios|fxios|edg|opr).)*safari/i.test(ua);
}

export function aiBrowserHint(language) {
  if (!isSafari()) return '';
  return language === 'en'
    ? 'Safari may not run in-browser AI models. If it fails, open the page in Chrome, Edge or another Chromium browser.'
    : 'В Safari браузерные AI-модели часто не запускаются. Если не работает — откройте страницу в Chrome, Edge или другом браузере на Chromium.';
}

export function aiErrorHint(language) {
  return language === 'en'
    ? 'Could not run the model. This usually means the browser lacks support — try Chrome or Edge, or a smaller image.'
    : 'Не удалось запустить модель. Обычно это значит, что браузер не поддерживает функцию — попробуйте Chrome или Edge, либо изображение поменьше.';
}
