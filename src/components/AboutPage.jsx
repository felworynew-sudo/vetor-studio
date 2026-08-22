import ImageWithFallback from './ImageWithFallback';
import { withBase } from '../utils/format';

const copyMap = {
  ru: {
    eyebrow: 'О студии',
    title: 'Vetor — дизайн и айти под задачи бизнеса',
    lead: 'Один универсальный подрядчик вместо десяти: от логотипа и сайта до собственного софта, который экономит время и деньги.',
    name: 'Кирилл Шелудько',
    role: 'Дизайнер и основатель студии Vetor, Краснодар',
    contact: 'Обсудить проект',
    paras: [
      'Привет! Меня зовут Кирилл Шелудько, я основатель студии Vetor и универсальный дизайнер из Краснодара.',
      'Я закрываю не только визуал — превью для YouTube, обложки, логотипы, фирменный стиль, шрифты и сайты, — но и техническую часть. Пишу для бизнеса софт и системы: плагины, CRM, автоматизацию рутины. То есть могу собрать проект целиком: от знака и лендинга до внутреннего инструмента, который реально ускоряет работу.',
      'Работаю так, чтобы дизайн не просто красиво выглядел, а решал задачу — приводил клиентов, поднимал средний чек, убирал ручную рутину. Без созвонов ради созвонов: пишете задачу — согласуем формат, сроки и стоимость, и я делаю.',
      'Часть работ в портфолио — коммерческие, часть я делал из интереса, когда цеплял вайб бренда. Подход в обоих случаях одинаковый — как к своему.',
    ],
  },
  en: {
    eyebrow: 'About',
    title: 'Vetor — design and software for business',
    lead: 'One versatile contractor instead of ten: from a logo and a website to custom software that saves time and money.',
    name: 'Kirill Sheludko',
    role: 'Designer and founder of Vetor studio, Krasnodar',
    contact: 'Start a project',
    paras: [
      "Hi! I'm Kirill Sheludko, founder of Vetor and a versatile designer based in Krasnodar.",
      'I cover not only the visuals — YouTube thumbnails, covers, logos, brand identity, fonts, and websites — but also the technical side. I build software and systems for business: plugins, CRMs, and routine automation. So I can deliver a whole project: from a mark and a landing page to an internal tool that genuinely speeds up work.',
      'I make design that not only looks good but solves the task — brings clients, raises the average order value, and removes manual routine. No calls for the sake of calls: you describe the task, we agree on scope, timing, and price, and I build it.',
      'Some works in the portfolio are commercial; some I did out of interest when a brand’s vibe caught me. Either way, I treat it as my own.',
    ],
  },
};

function AboutPage({ language, siteConfig, contactUrl }) {
  const copy = copyMap[language] ?? copyMap.ru;
  const avatar = siteConfig?.owner?.avatar || '/owner/z2.jpg';
  return (
    <section className="section-page about-page">
      <div className="section-page-head surface-panel">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.lead}</p>
      </div>

      <div className="about-body surface-panel">
        <div className="about-portrait">
          <ImageWithFallback src={withBase(avatar)} fallback={withBase('/owner/owner-avatar.webp')} alt={copy.name} />
        </div>
        <div className="about-text">
          <h2>{copy.name}</h2>
          <p className="about-role">{copy.role}</p>
          {copy.paras.map((p, i) => <p key={i}>{p}</p>)}
          <div className="about-actions">
            <a
              className="cta-button primary"
              href={contactUrl || 'https://t.me/felwory'}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.contact}
            </a>
            <a className="cta-button secondary" href="https://profi.ru/profile/SheludkoKN/" target="_blank" rel="noopener noreferrer">
              {language === 'ru' ? 'Профиль на Профи.ру' : 'Profi.ru profile'}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default AboutPage;
