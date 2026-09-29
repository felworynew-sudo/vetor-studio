import DitherStudio from './shared/DitherStudio';

// Квантизатор / постеризатор: 2–64 цвета, палитра image-q (Wu / NeuQuant / RGBQuant)
// или готовая, опциональный дизеринг. Для принтов, шелкографии, пиксель-арта и SVG.

const NOTE = {
  ru: '🔒 Всё локально. Меньше цветов — удобнее печать и векторизация; для плавных градиентов включите дизеринг.',
  en: '🔒 All local. Fewer colors make printing and vectorizing easier; turn on dithering for smooth gradients.',
};

export default function Quantizer({ language = 'ru' }) {
  return (
    <>
      <DitherStudio language={language} variant="quantize" />
      <p className="tool-local-note">{NOTE[language] || NOTE.ru}</p>
    </>
  );
}
