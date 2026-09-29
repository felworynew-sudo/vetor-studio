import DitherStudio from './shared/DitherStudio';

// Dithering Lab: 13 алгоритмов (Floyd–Steinberg, Atkinson, JJN, Stucki, Burkes,
// Sierra, Bayer 2/4/8, blue-noise…), ретро-палитры (Game Boy, PICO-8, CGA, Mac,
// C64, EGA, e-ink), свои два цвета, размер пикселя и предобработка.

const NOTE = {
  ru: '🔒 Всё локально. Atkinson — «макинтошный» светлый дизеринг, Bayer — узор ретро-игр, blue noise — самый ровный шум без узоров.',
  en: '🔒 All local. Atkinson is the light “Macintosh” look, Bayer is the retro-game pattern, blue noise is the smoothest pattern-free grain.',
};

export default function DitheringLab({ language = 'ru' }) {
  return (
    <>
      <DitherStudio language={language} variant="dither" />
      <p className="tool-local-note">{NOTE[language] || NOTE.ru}</p>
    </>
  );
}
