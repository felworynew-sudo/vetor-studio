// Одноразовая передача записанного/готового аудио между тулами (диктофон →
// многодорожечный редактор) без перезагрузки страницы. Живёт в памяти модуля, так
// что переживает SPA-навигацию, но теряется при полном релоаде — это осознанно
// (передаём тяжёлый AudioBuffer, не сериализуем).

let pending = null; // { buffer: AudioBuffer, name: string }

export function setAudioHandoff(data) { pending = data; }

export function takeAudioHandoff() {
  const p = pending;
  pending = null;
  return p;
}
