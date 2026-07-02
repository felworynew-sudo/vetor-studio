import ImageWithFallback from './ImageWithFallback';
import { withBase } from '../utils/format';

const BOT_URL = 'https://t.me/VetorPluginBOT';
const BOT_HANDLE = '@VetorPluginBOT';
const PLACEHOLDER = '/plugins/placeholder.svg';

function PluginImage({ src, alt, className }) {
  return (
    <ImageWithFallback
      src={withBase(src)}
      fallback={withBase(PLACEHOLDER)}
      alt={alt}
      className={className}
      loading="lazy"
    />
  );
}

const CONTENT = {
  ru: {
    eyebrow: 'Плагин · Resto',
    title: 'Resto — реставрация старых фото и макеты для памятников за минуты',
    lead: 'Resto — плагин для мастерских, ретушёров и граверов. Он восстанавливает старые и повреждённые снимки и собирает готовые макеты портретов на памятники — без ручной возни со слоями и часов рутинной ретуши.',
    ctaPrimary: 'Оформить подписку в боте',
    ctaSecondary: 'Как это работает',
    botNote: `Покупка и активация — через Telegram-бот ${BOT_HANDLE}`,
    heroAlt: 'Интерфейс плагина Resto: реставрация фотографии',
    valuesTitle: 'Зачем нужен Resto',
    values: [
      { t: 'Быстрая реставрация', d: 'Убирает царапины, трещины, заломы, пятна и выцветание, восстанавливает лицо и мелкие детали за несколько кликов.' },
      { t: 'Макеты на памятники', d: 'Готовые шаблоны портрета, дат, эпитафий и виньеток — собираете макет под печать или гравировку в пару шагов.' },
      { t: 'Доступ по подписке', d: 'Помесячная оплата через Telegram-бот, без привязки к железу. Обновления и новые пресеты уже включены.' },
      { t: 'Экономия времени', d: 'То, что раньше занимало час ретуши, Resto делает за минуты. Больше заказов — меньше рутины.' },
    ],
    stepsTitle: 'Как это работает',
    steps: [
      { t: 'Открываете фото', d: 'Загружаете старый или повреждённый снимок прямо в Resto.' },
      { t: 'Выбираете режим', d: 'Реставрация фотографии или сборка макета для памятника.' },
      { t: 'Resto делает основную работу', d: 'Плагин восстанавливает снимок или собирает макет по шаблону автоматически.' },
      { t: 'Правите и выгружаете', d: 'Доводите детали и экспортируете результат под печать или гравировку.' },
    ],
    featuresTitle: 'Что внутри',
    features: [
      'Восстановление лиц и мелких деталей',
      'Удаление царапин, трещин и пятен',
      'Коррекция контраста и тона выцветших фото',
      'Библиотека шаблонов памятников: портрет, даты, эпитафии, виньетки',
      'Пакетная обработка нескольких фото',
      'Экспорт в высоком разрешении под печать и гравировку',
    ],
    beforeAfterAlt: 'Пример реставрации: фото до и после обработки в Resto',
    monumentAlt: 'Готовый макет портрета на памятник, собранный в Resto',
    priceTitle: 'Доступ по подписке',
    priceText: `Resto распространяется по подписке. Оформление, оплата и активация проходят прямо в Telegram-боте ${BOT_HANDLE} — быстро и без лишних шагов.`,
    faqTitle: 'Частые вопросы',
    faq: [
      { q: 'Что такое Resto?', a: 'Это плагин для быстрой реставрации старых фотографий и сборки макетов портретов на памятники. Он берёт на себя рутину, которую обычно делают вручную.' },
      { q: 'Как купить и активировать?', a: `Всё проходит в Telegram-боте ${BOT_HANDLE}: оформляете подписку, оплачиваете и получаете доступ. Отдельная лицензия на конкретный компьютер не нужна.` },
      { q: 'Подходит ли для мастерских памятников?', a: 'Да. Resto создан в том числе для граверов и ритуальных мастерских: реставрирует портреты и собирает макеты под гравировку по готовым шаблонам.' },
      { q: 'Нужен ли мощный компьютер?', a: 'Нет, особых требований к железу нет. Resto работает быстро на обычных рабочих машинах.' },
    ],
    finalTitle: 'Готовы ускорить реставрацию и макеты?',
    finalText: `Подключите Resto в боте ${BOT_HANDLE} и обрабатывайте фото и памятники в разы быстрее.`,
  },
  en: {
    eyebrow: 'Plugin · Resto',
    title: 'Resto — restore old photos and build monument layouts in minutes',
    lead: 'Resto is a plugin for retouchers, engravers, and memorial workshops. It restores old and damaged photos and assembles ready portrait layouts for monuments — without hours of manual layer work.',
    ctaPrimary: 'Subscribe via the bot',
    ctaSecondary: 'How it works',
    botNote: `Purchase and activation happen in the Telegram bot ${BOT_HANDLE}`,
    heroAlt: 'Resto plugin interface: photo restoration',
    valuesTitle: 'Why Resto',
    values: [
      { t: 'Fast restoration', d: 'Removes scratches, cracks, creases, stains, and fading; rebuilds faces and fine detail in a few clicks.' },
      { t: 'Monument layouts', d: 'Ready templates for portraits, dates, epitaphs, and vignettes — build a layout for print or engraving in a couple of steps.' },
      { t: 'Subscription access', d: 'Monthly billing through a Telegram bot, not tied to hardware. Updates and new presets included.' },
      { t: 'Save time', d: 'What used to take an hour of retouching, Resto does in minutes. More orders, less routine.' },
    ],
    stepsTitle: 'How it works',
    steps: [
      { t: 'Open a photo', d: 'Load an old or damaged photo straight into Resto.' },
      { t: 'Pick a mode', d: 'Photo restoration or building a monument layout.' },
      { t: 'Resto does the heavy lifting', d: 'The plugin restores the photo or assembles the layout from a template automatically.' },
      { t: 'Refine and export', d: 'Fine-tune the details and export for print or engraving.' },
    ],
    featuresTitle: 'What is inside',
    features: [
      'Face and fine-detail reconstruction',
      'Scratch, crack, and stain removal',
      'Contrast and tone correction for faded photos',
      'Monument template library: portrait, dates, epitaphs, vignettes',
      'Batch processing of multiple photos',
      'High-resolution export for print and engraving',
    ],
    beforeAfterAlt: 'Restoration example: photo before and after Resto',
    monumentAlt: 'Finished portrait layout for a monument, built in Resto',
    priceTitle: 'Subscription access',
    priceText: `Resto is available by subscription. Sign-up, payment, and activation all happen inside the Telegram bot ${BOT_HANDLE} — fast, with no extra steps.`,
    faqTitle: 'FAQ',
    faq: [
      { q: 'What is Resto?', a: 'A plugin for fast restoration of old photos and building portrait layouts for monuments. It takes over the routine you would otherwise do by hand.' },
      { q: 'How do I buy and activate it?', a: `Everything happens in the Telegram bot ${BOT_HANDLE}: subscribe, pay, and get access. No per-machine license needed.` },
      { q: 'Is it suitable for monument workshops?', a: 'Yes. Resto is built for engravers and memorial workshops: it restores portraits and assembles engraving-ready layouts from templates.' },
      { q: 'Do I need a powerful computer?', a: 'No special hardware requirements. Resto runs fast on ordinary work machines.' },
    ],
    finalTitle: 'Ready to speed up restoration and layouts?',
    finalText: `Get Resto in the bot ${BOT_HANDLE} and process photos and monuments many times faster.`,
  },
};

function PluginsPage({ language }) {
  const copy = CONTENT[language] || CONTENT.ru;

  return (
    <section className="section-page resto-page">
      {/* Hero */}
      <div className="section-page-head surface-panel resto-hero">
        <div className="resto-hero-copy">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="resto-lead">{copy.lead}</p>
          <div className="resto-hero-actions">
            <a className="cta-button primary resto-bot-button" href={BOT_URL} target="_blank" rel="noopener noreferrer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z" />
              </svg>
              {copy.ctaPrimary}
            </a>
            <a className="cta-button secondary" href="#resto-how">{copy.ctaSecondary}</a>
          </div>
          <p className="resto-bot-note">{copy.botNote}</p>
        </div>
        <figure className="resto-hero-media">
          <PluginImage src="/plugins/resto-hero.gif" alt={copy.heroAlt} />
        </figure>
      </div>

      {/* Value props */}
      <div className="resto-block">
        <h2 className="resto-h2">{copy.valuesTitle}</h2>
        <div className="resto-cards">
          {copy.values.map((v) => (
            <article key={v.t} className="resto-card surface-panel">
              <h3>{v.t}</h3>
              <p>{v.d}</p>
            </article>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="resto-block" id="resto-how">
        <h2 className="resto-h2">{copy.stepsTitle}</h2>
        <ol className="resto-steps">
          {copy.steps.map((s, i) => (
            <li key={s.t} className="resto-step surface-panel">
              <span className="resto-step-num">{i + 1}</span>
              <div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Media + features */}
      <div className="resto-block resto-split">
        <figure className="resto-media surface-panel">
          <PluginImage src="/plugins/resto-before-after.jpg" alt={copy.beforeAfterAlt} />
        </figure>
        <div className="resto-features-wrap">
          <h2 className="resto-h2">{copy.featuresTitle}</h2>
          <ul className="resto-features">
            {copy.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Monument layout showcase */}
      <div className="resto-block resto-split resto-split-reverse">
        <figure className="resto-media surface-panel">
          <PluginImage src="/plugins/resto-monument.jpg" alt={copy.monumentAlt} />
        </figure>
        <div className="resto-price surface-panel">
          <h2 className="resto-h2">{copy.priceTitle}</h2>
          <p>{copy.priceText}</p>
          <a className="cta-button primary resto-bot-button" href={BOT_URL} target="_blank" rel="noopener noreferrer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z" />
            </svg>
            {copy.ctaPrimary}
          </a>
        </div>
      </div>

      {/* FAQ */}
      <div className="resto-block">
        <h2 className="resto-h2">{copy.faqTitle}</h2>
        <div className="resto-faq">
          {copy.faq.map((item) => (
            <details key={item.q} className="resto-faq-item surface-panel">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* Final CTA */}
      <div className="resto-final surface-panel">
        <h2 className="resto-h2">{copy.finalTitle}</h2>
        <p>{copy.finalText}</p>
        <a className="cta-button primary resto-bot-button resto-bot-button-lg" href={BOT_URL} target="_blank" rel="noopener noreferrer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z" />
          </svg>
          {copy.ctaPrimary}
        </a>
      </div>
    </section>
  );
}

export default PluginsPage;
