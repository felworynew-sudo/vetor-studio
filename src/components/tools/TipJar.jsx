import { useEffect, useState } from 'react';

// «Оставить чаевые»: сайт присылает сумму на наш сервер (api.vetor-studio.ru/tips),
// сервер создаёт платёж в ЮKassa и возвращает ссылку — оплата происходит на стороне
// ЮKassa, ключи и данные карты до сайта не доходят.

const ENDPOINT = 'https://api.vetor-studio.ru/tips/create';
const AMOUNTS = [100, 300, 500];
const MIN = 50;
const MAX = 50000;

const TEXT = {
  ru: {
    title: 'Оставить чаевые',
    text: 'Верстак бесплатный и работает у вас в браузере, файлы никуда не уходят. Если инструмент выручил, можно поддержать проект: от нас новые инструменты и улучшения.',
    custom: 'Своя сумма, ₽',
    email: 'Email для чека',
    emailHint: 'ЮKassa просит email, чтобы прислать чек',
    pay: (v) => `Поддержать на ${v} ₽`,
    paying: 'Открываю оплату…',
    secure: 'Оплата на стороне ЮKassa: мы не видим данные вашей карты.',
    thanks: 'Спасибо! Ваша поддержка получена, это очень помогает делать инструменты лучше.',
    errRange: `Сумма от ${MIN} до ${MAX} ₽`,
    errEmail: 'Проверьте email',
    errMany: 'Слишком часто. Попробуйте через минуту.',
    errNet: 'Не удалось связаться с сервером оплаты. Попробуйте ещё раз чуть позже.',
  },
  en: {
    title: 'Leave a tip',
    text: 'Verstak is free and runs in your browser, your files never leave your device. If a tool saved you time, you can support the project: it funds new tools and improvements.',
    custom: 'Custom amount, ₽',
    email: 'Email for the receipt',
    emailHint: 'The payment provider asks for an email to send the receipt',
    pay: (v) => `Tip ${v} ₽`,
    paying: 'Opening the payment…',
    secure: 'Payment is handled by YooKassa: we never see your card details.',
    thanks: 'Thank you! Your support has arrived, it really helps us build better tools.',
    errRange: `Amount from ${MIN} to ${MAX} ₽`,
    errEmail: 'Check the email address',
    errMany: 'Too many attempts. Try again in a minute.',
    errNet: 'Could not reach the payment server. Please try again a little later.',
  },
};

function TipJar({ lang = 'ru' }) {
  const t = TEXT[lang] || TEXT.ru;
  const [amount, setAmount] = useState(300);
  const [custom, setCustom] = useState('');
  const [email, setEmail] = useState('');
  const [needEmail, setNeedEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState(false);

  // Возврат с оплаты: /tools?tip=thanks — показываем благодарность и чистим адрес.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('tip') !== 'thanks') return;
      setThanks(true);
      q.delete('tip');
      const rest = q.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    } catch { /* без адресной строки обойдёмся */ }
  }, []);

  const value = custom.trim() ? Number(custom.replace(',', '.')) : amount;

  async function pay() {
    setError('');
    if (!Number.isFinite(value) || value < MIN || value > MAX) { setError(t.errRange); return; }
    setBusy(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Math.round(value * 100) / 100, ...(email.trim() ? { email: email.trim() } : {}) }),
        signal: ctl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.confirmation_url) {
        window.location.assign(data.confirmation_url);
        return;
      }
      if (res.status === 422 && data.error === 'receipt_required') { setNeedEmail(true); setError(t.emailHint); }
      else if (data.error === 'bad_email') setError(t.errEmail);
      else if (data.error === 'amount_out_of_range') setError(t.errRange);
      else if (res.status === 429) setError(t.errMany);
      else setError(t.errNet);
    } catch {
      setError(t.errNet);
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <section className="tip-jar" aria-labelledby="tip-jar-title">
      <h2 id="tip-jar-title">☕ {t.title}</h2>
      {thanks && <p className="tip-jar-thanks" role="status">{t.thanks}</p>}
      <p>{t.text}</p>
      <div className="tip-jar-row">
        <div className="segmented" role="group" aria-label={t.title}>
          {AMOUNTS.map((v) => (
            <button
              key={v}
              type="button"
              className={!custom.trim() && amount === v ? 'segmented-btn is-active' : 'segmented-btn'}
              onClick={() => { setAmount(v); setCustom(''); setError(''); }}
            >
              {v} ₽
            </button>
          ))}
        </div>
        <label className="tip-jar-field">
          <span>{t.custom}</span>
          <input type="text" inputMode="decimal" value={custom} placeholder="250" onChange={(e) => setCustom(e.target.value.replace(/[^\d.,]/g, ''))} />
        </label>
        {needEmail && (
          <label className="tip-jar-field">
            <span>{t.email}</span>
            <input type="email" value={email} placeholder="name@example.com" onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
      </div>
      <div className="tip-jar-row">
        <button type="button" className="tools-btn primary" onClick={pay} disabled={busy}>
          {busy ? t.paying : t.pay(Number.isFinite(value) ? value : '')}
        </button>
        <span className="tip-jar-note">{t.secure}</span>
      </div>
      {error && <p className="tip-jar-error" role="alert">{error}</p>}
    </section>
  );
}

export default TipJar;
