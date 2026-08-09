const copyMap = {
  ru: {
    eyebrow: 'Документы',
    title: 'Политика конфиденциальности',
    updated: 'Обновлено: 9 августа 2026',
    sections: [
      ['1. Кто обрабатывает данные', 'Оператор — Шелудько Кирилл (плательщик налога на профессиональный доход, самозанятый), ИНН 233505486022, город Краснодар. Далее — «Студия». Обрабатывая ваши данные, Студия действует в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».'],
      ['2. Какие данные собираются', 'Студия обрабатывает только те данные, которые вы сообщаете сами, когда пишете нам: имя или ник, контакт (Telegram, WhatsApp, телефон, e-mail) и текст обращения. Сайт не собирает платёжные данные и не запрашивает документы. Обезличенные технические данные (например, статистика посещений) могут собираться сервисами аналитики.'],
      ['3. Зачем', 'Данные используются только чтобы ответить на ваше обращение, обсудить задачу, согласовать условия и выполнить работу. Мы не рассылаем спам и не используем данные для целей, о которых вы не просили.'],
      ['4. Передача третьим лицам', 'Студия не продаёт и не передаёт ваши персональные данные третьим лицам. Данные могут обрабатываться в сервисах, через которые идёт общение (Telegram, WhatsApp) — в рамках их собственных политик.'],
      ['5. Хранение и защита', 'Данные хранятся не дольше, чем нужно для решения вашей задачи, и защищаются разумными организационными мерами. По вашему запросу переписка и контакты удаляются.'],
      ['6. Ваши права', 'Вы можете в любой момент запросить, какие ваши данные у нас есть, попросить их исправить или удалить, а также отозвать согласие на обработку. Для этого напишите нам в Telegram или на почту.'],
      ['7. Согласие', 'Отправляя нам сообщение через мессенджер, форму или почту, вы подтверждаете согласие на обработку указанных вами персональных данных в объёме и целях, описанных выше.'],
    ],
    contactLine: 'Контакт для вопросов по данным: Telegram @felwory, почта Vetor-studio@yandex.com.',
  },
  en: {
    eyebrow: 'Documents',
    title: 'Privacy Policy',
    updated: 'Updated: 9 August 2026',
    sections: [
      ['1. Who processes the data', 'The operator is Kirill Sheludko (self-employed / professional income tax payer), TIN 233505486022, Krasnodar, Russia. Personal data is processed in line with Russian Federal Law No. 152-FZ.'],
      ['2. What is collected', 'Only the data you provide yourself when you contact us: a name or nickname, a contact (Telegram, WhatsApp, phone, e-mail), and your message. The site does not collect payment data. Anonymised technical data may be collected by analytics services.'],
      ['3. Purpose', 'Data is used only to reply to your request, discuss the task, agree on terms, and do the work. No spam, no unrelated use.'],
      ['4. Third parties', 'We do not sell or share your personal data. Data may be processed by the messengers you use to reach us (Telegram, WhatsApp) under their own policies.'],
      ['5. Storage & protection', 'Data is kept no longer than needed and protected by reasonable measures. On request, correspondence and contacts are deleted.'],
      ['6. Your rights', 'You can ask what data we hold, request correction or deletion, and withdraw consent at any time by messaging us.'],
      ['7. Consent', 'By messaging us via a messenger, form, or e-mail, you consent to processing of the personal data you provide, for the purposes described above.'],
    ],
    contactLine: 'Data questions: Telegram @felwory, e-mail Vetor-studio@yandex.com.',
  },
};

function PrivacyPage({ language }) {
  const copy = copyMap[language] ?? copyMap.ru;
  return (
    <section className="section-page privacy-page">
      <div className="section-page-head surface-panel">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.updated}</p>
      </div>
      <div className="privacy-body surface-panel">
        {copy.sections.map(([h, t]) => (
          <div key={h} className="privacy-block">
            <h2>{h}</h2>
            <p>{t}</p>
          </div>
        ))}
        <p className="privacy-contact">{copy.contactLine}</p>
      </div>
    </section>
  );
}

export default PrivacyPage;
