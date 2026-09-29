import FxStudio from './shared/FxStudio';

// CRT / глитч: ретро-эффекты на видеокарте (общий движок utils/fxGL) — кривизна
// кинескопа, скан-линии, RGB-маска, свечение, RGB-сдвиг, глитч-блоки. Полное
// разрешение, живая анимация и запись WebM вместо прежнего CPU-цикла по пикселям.

const NOTE = {
  ru: 'Ретро-CRT и глитч на видеокарте. Двойной клик по ползунку — сброс. Всё локально.',
  en: 'Retro CRT and glitch on the GPU. Double-click a slider to reset. All local.',
};

export default function CrtGlitch({ language = 'ru' }) {
  return <FxStudio language={language} groups={['crt', 'glitch', 'tone']} presets={['crt', 'arcade', 'glitch']} initial="crt" note={NOTE[language] || NOTE.ru} />;
}
