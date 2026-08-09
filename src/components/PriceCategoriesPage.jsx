import ImageWithFallback from './ImageWithFallback';
import DevEditButton from './DevEditButton';
import { withBase } from '../utils/format';

const PLACEHOLDER = '/gallery/gallery-placeholder.svg';

// Parse a Russian ruble price string ("от 5 000 ₽", "по запросу") to a number.
function parseRub(value) {
  const digits = String(value || '').replace(/[\s ]/g, '').match(/\d+/g);
  if (!digits) {
    return null;
  }
  const amount = Number(digits.join(''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// Cheapest concrete price for a category → "от N ₽" (skips "по запросу").
function categoryFromText(category, pricing, language) {
  const sources = category.kind === 'thumbnails'
    ? (pricing?.thumbnailSegments || []).map((segment) => segment.price)
    : ((category.detail && category.detail.rows) || []).map((row) => row.price);
  const amounts = sources.map(parseRub).filter((value) => value != null);
  if (!amounts.length) {
    return '';
  }
  const min = Math.min(...amounts);
  const prefix = language === 'en' ? 'from' : 'от';
  return `${prefix} ${min.toLocaleString('ru-RU')} ₽`;
}

const priceCatText = {
  ru: {
    eyebrow: 'Цены',
    title: 'Что будем делать?',
    lead: 'Выбери услугу — внутри цены, форматы и сроки. Не нашли нужное — напишите нам.',
    createItem: 'Добавить категорию',
    contactCta: 'Написать нам',
  },
  en: {
    eyebrow: 'Pricing',
    title: 'What are we making?',
    lead: 'Pick a service — prices, formats, and timing inside. Not listed? Message us.',
    createItem: 'Add category',
    contactCta: 'Message us',
  },
};

function PriceCategoriesPage({
  language,
  copy,
  categories = [],
  pricing,
  contactUrl,
  studioEnabled = false,
  onEditHeading,
  onOpenCategory,
  onCreateItem,
  onEditItem,
  onDeleteItem,
}) {
  const base = priceCatText[language] ?? priceCatText.ru;
  const ui = {
    ...base,
    eyebrow: copy?.eyebrow || base.eyebrow,
    title: copy?.title || base.title,
    lead: copy?.lead || base.lead,
  };
  const titleKey = language === 'ru' ? 'ruTitle' : 'enTitle';
  const subtitleKey = language === 'ru' ? 'ruSubtitle' : 'enSubtitle';
  const faq = language === 'ru'
    ? [
        ['Какие сроки на работу?', 'Одиночное превью — обычно 1–2 дня. Логотип, фирменный стиль или сайт — от нескольких дней до пары недель. Точный срок называем после короткого брифа.'],
        ['Сколько правок входит в стоимость?', 'В базовые форматы входят 1–2 раунда правок, в крупные проекты — больше. Всё фиксируем на старте, чтобы не было сюрпризов.'],
        ['В каком виде передаёте файлы?', 'Готовые макеты отдаём в нужных форматах: PNG/JPG, PDF, при необходимости — исходники. Передаём через облако или Telegram.'],
        ['Как начать работу?', 'Напишите в Telegram или WhatsApp и опишите задачу. Согласуем формат, сроки и стоимость — и стартуем, без обязательных созвонов.'],
      ]
    : [
        ['What are the timelines?', 'A single thumbnail usually takes 1–2 days. A logo, brand identity, or website — from a few days to a couple of weeks. We confirm the exact timing after a short brief.'],
        ['How many revisions are included?', 'Basic formats include 1–2 revision rounds; larger projects include more. We fix this upfront so there are no surprises.'],
        ['How do you deliver the files?', 'Final artwork is delivered in the needed formats: PNG/JPG, PDF, and source files on request — via cloud or Telegram.'],
        ['How do we start?', 'Message us on Telegram or WhatsApp and describe the task. We agree on scope, timing, and price — and start, with no mandatory calls.'],
      ];

  return (
    <section className="section-page price-cats-page">
      <div className="section-page-head surface-panel">
        {studioEnabled && onEditHeading ? <DevEditButton label="Edit heading" onClick={onEditHeading} className="section-edit-button" /> : null}
        <p className="eyebrow">{ui.eyebrow}</p>
        <h1>{ui.title}</h1>
        <p>{ui.lead}</p>
        {studioEnabled && onCreateItem ? (
          <div className="design-actions-row">
            <button type="button" className="cta-button secondary" onClick={onCreateItem}>
              {ui.createItem}
            </button>
          </div>
        ) : null}
      </div>

      <div className="price-cats-grid">
        {categories.map((category) => {
          const title = category[titleKey] || category.ruTitle || category.id;
          const subtitle = category[subtitleKey] || category.ruSubtitle || '';
          const style = category.accentColor ? { '--price-cat-accent': category.accentColor } : undefined;
          const isContact = category.kind === 'contact';
          const fromText = categoryFromText(category, pricing, language);

          if (isContact) {
            return (
              <a
                key={category.id}
                className="price-cat-card price-cat-contact"
                href={contactUrl || 'https://t.me/felwory'}
                target="_blank"
                rel="noopener noreferrer"
                style={style}
              >
                {studioEnabled ? (
                  <div className="gallery-tile-actions" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
                    <button type="button" className="gallery-tile-action" onClick={() => onEditItem?.(category)} aria-label="Edit" title="Edit">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.73 3.69a2.25 2.25 0 0 1 3.18 3.18l-9.84 9.84-4.2.86.86-4.2 9.84-9.84Z" fill="currentColor" /></svg>
                    </button>
                  </div>
                ) : null}
                <div className="price-cat-body">
                  <div className="price-cat-copy">
                    <h2>{title}</h2>
                    {subtitle ? <p>{subtitle}</p> : null}
                  </div>
                  <span className="cta-button primary price-cat-contact-cta">{ui.contactCta}</span>
                </div>
              </a>
            );
          }

          return (
            <div
              key={category.id}
              className="price-cat-card"
              role="button"
              tabIndex={0}
              style={style}
              onClick={() => onOpenCategory?.(category)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpenCategory?.(category);
                }
              }}
            >
              {studioEnabled ? (
                <div className="gallery-tile-actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="gallery-tile-action" onClick={() => onEditItem?.(category)} aria-label="Edit" title="Edit">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.73 3.69a2.25 2.25 0 0 1 3.18 3.18l-9.84 9.84-4.2.86.86-4.2 9.84-9.84Z" fill="currentColor" /></svg>
                  </button>
                  <button type="button" className="gallery-tile-action danger" onClick={() => onDeleteItem?.(category)} aria-label="Delete" title="Delete">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Z" fill="currentColor" /></svg>
                  </button>
                </div>
              ) : null}
              <div className="price-cat-media">
                <ImageWithFallback
                  src={withBase(category.image || PLACEHOLDER)}
                  fallback={withBase(PLACEHOLDER)}
                  alt={title}
                />
              </div>
              <div className="price-cat-body">
                <div className="price-cat-copy">
                  <h2>{title}</h2>
                  {subtitle ? <p>{subtitle}</p> : null}
                  {fromText ? <span className="price-cat-from">{fromText}</span> : null}
                </div>
                <span className="price-cat-go" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <section className="price-faq surface-panel" aria-label={language === 'ru' ? 'Частые вопросы' : 'FAQ'}>
        <h2>{language === 'ru' ? 'Частые вопросы' : 'Frequently asked questions'}</h2>
        <div className="price-faq-list">
          {faq.map(([q, a]) => (
            <details key={q} className="price-faq-item">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </section>
  );
}

export default PriceCategoriesPage;
