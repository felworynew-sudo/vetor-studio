import FxStudio from './shared/FxStudio';

// VHS / Print Lab: полноценный процедурный стек ретро-эффектов — VHS (дрожание,
// трекинг, размытый хром, помехи, таймкод), CRT, глитч, печать (несовмещение CMY,
// ризограф, бумага), плёнка (зерно, царапины, засветка). Анимация и запись видео.

const NOTE = {
  ru: 'Эффекты складываются в стек и считаются на видеокарте. Пресеты — отправная точка, всё настраивается. Всё локально.',
  en: 'Effects stack up and run on the GPU. Presets are a starting point — everything is adjustable. All local.',
};

export default function RetroLab({ language = 'ru' }) {
  return <FxStudio language={language} initial="vhs" note={NOTE[language] || NOTE.ru} />;
}
