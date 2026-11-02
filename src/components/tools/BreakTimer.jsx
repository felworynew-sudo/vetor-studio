import { useEffect, useRef, useState } from 'react';

// Таймер 20-20-20: каждые 20 минут — 20 секунд смотреть на 20 метров вдаль.
// Время считается по часам (момент окончания фазы), а тикает отдельный воркер:
// браузер почти не тормозит таймеры воркеров в свёрнутой вкладке, поэтому смена
// фазы приходит вовремя. О перерыве сообщают системное уведомление, звук и
// заголовок вкладки. Работает локально.

const REST_SECONDS = 20;
const WORK_OPTIONS = [20, 30, 45, 60];

const TEXT = {
  ru: {
    work: 'До перерыва', rest: 'Отдых для глаз', restHint: 'Смотрите вдаль ~20 метров',
    start: 'Старт', pause: 'Пауза', reset: 'Сброс', interval: 'Интервал', min: 'мин',
    cycles: 'Циклов пройдено', sound: 'Звук', notify: 'Уведомления', notifyOn: 'Уведомления включены',
    notifyAsk: 'Включить уведомления', notifyDenied: 'Уведомления запрещены в настройках браузера для этого сайта.',
    notifyNo: 'Этот браузер не умеет системные уведомления — останутся звук и заголовок вкладки.',
    nRestTitle: 'Пора дать глазам отдых', nRestBody: '20 секунд смотрите вдаль, примерно на 20 метров.',
    nWorkTitle: 'Отдых окончен', nWorkBody: 'Можно возвращаться к работе.',
    tabRest: 'Отдых для глаз', hint: 'Правило 20-20-20 снижает усталость глаз при работе за экраном. Таймер работает и в свёрнутой вкладке.',
  },
  en: {
    work: 'Until break', rest: 'Eye rest', restHint: 'Look ~20 meters away',
    start: 'Start', pause: 'Pause', reset: 'Reset', interval: 'Interval', min: 'min',
    cycles: 'Cycles done', sound: 'Sound', notify: 'Notifications', notifyOn: 'Notifications on',
    notifyAsk: 'Turn on notifications', notifyDenied: 'Notifications are blocked for this site in your browser settings.',
    notifyNo: 'This browser has no system notifications — sound and the tab title still work.',
    nRestTitle: 'Time to rest your eyes', nRestBody: 'Look about 20 meters away for 20 seconds.',
    nWorkTitle: 'Break is over', nWorkBody: 'Back to work.',
    tabRest: 'Eye rest', hint: 'The 20-20-20 rule reduces eye strain from screen work. The timer keeps working in a background tab.',
  },
};

const TICKER = 'let id=0;onmessage=(e)=>{clearInterval(id);if(e.data==="start")id=setInterval(()=>postMessage(0),500);};';

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function beep(freq = 660) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.frequency.value = freq; osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch { /* ignore */ }
}

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

function BreakTimer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [workMin, setWorkMin] = useState(20);
  const [phase, setPhase] = useState('work'); // 'work' | 'rest'
  const [endAt, setEndAt] = useState(0); // момент окончания фазы (мс), 0 — на паузе
  const [left, setLeft] = useState(20 * 60); // сколько оставалось при паузе (с)
  const [now, setNow] = useState(Date.now());
  const [cycles, setCycles] = useState(0);
  const [sound, setSound] = useState(true);
  const [perm, setPerm] = useState(() => (canNotify() ? Notification.permission : 'unsupported'));

  const state = useRef({});
  state.current = { phase, endAt, workMin, sound, perm, t };
  const workerRef = useRef(null);
  const titleRef = useRef('');

  const running = endAt > 0;
  const total = phase === 'work' ? workMin * 60 : REST_SECONDS;
  const remaining = running ? Math.max(0, Math.ceil((endAt - now) / 1000)) : left;

  function notify(title, body) {
    if (state.current.perm !== 'granted') return;
    try {
      const n = new Notification(title, { body, tag: 'vetor-20-20-20', renotify: true, silent: !state.current.sound });
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* мобильный Chrome требует service worker — тихо пропускаем */ }
  }

  function onTick() {
    const s = state.current; const n = Date.now();
    setNow(n);
    if (!s.endAt || n < s.endAt) return;
    if (s.phase === 'work') {
      if (s.sound) beep(660);
      notify(s.t.nRestTitle, s.t.nRestBody);
      setPhase('rest'); setEndAt(n + REST_SECONDS * 1000);
    } else {
      if (s.sound) beep(880);
      notify(s.t.nWorkTitle, s.t.nWorkBody);
      setCycles((c) => c + 1);
      setPhase('work'); setEndAt(n + s.workMin * 60 * 1000);
    }
  }
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  useEffect(() => {
    let w = null;
    try {
      const url = URL.createObjectURL(new Blob([TICKER], { type: 'application/javascript' }));
      w = new Worker(url); URL.revokeObjectURL(url);
      w.onmessage = () => tickRef.current();
    } catch { w = null; }
    workerRef.current = w;
    titleRef.current = document.title;
    return () => { w?.terminate(); document.title = titleRef.current; };
  }, []);

  // Тикаем, только пока таймер идёт: воркер, а если его нет — обычный интервал.
  useEffect(() => {
    if (!running) return undefined;
    const w = workerRef.current;
    if (w) { w.postMessage('start'); return () => w.postMessage('stop'); }
    const id = setInterval(() => tickRef.current(), 500);
    return () => clearInterval(id);
  }, [running]);

  // Обратный отсчёт в заголовке вкладки — видно, даже когда она не активна.
  useEffect(() => {
    if (!titleRef.current) return;
    document.title = running ? `${phase === 'rest' ? `👁 ${t.tabRest}` : '⏱'} ${fmt(remaining)} · ${titleRef.current}` : titleRef.current;
  }, [running, remaining, phase, t.tabRest]);

  function toggle() {
    if (running) { setLeft(remaining); setEndAt(0); return; }
    setNow(Date.now()); setEndAt(Date.now() + left * 1000);
  }

  function reset() {
    setEndAt(0); setPhase('work'); setLeft(workMin * 60); setCycles(0);
  }

  function changeInterval(m) {
    setWorkMin(m);
    if (phase === 'work') { if (running) setEndAt(Date.now() + m * 60 * 1000); else setLeft(m * 60); }
  }

  async function askPermission() {
    if (!canNotify()) return;
    try { setPerm(await Notification.requestPermission()); } catch { /* */ }
  }

  return (
    <div className={`tool-panel break-timer phase-${phase}`}>
      <div className="bt-dial" style={{ '--bt-progress': 1 - remaining / total }}>
        <div className="bt-dial-inner">
          <span className="bt-phase">{phase === 'work' ? t.work : t.rest}</span>
          <span className="bt-time">{fmt(remaining)}</span>
          {phase === 'rest' && <span className="bt-resthint">{t.restHint}</span>}
        </div>
      </div>

      <div className="tool-controls bt-options">
        <div className="tool-field">
          <span className="tool-field-label">{t.interval}</span>
          <div className="segmented">
            {WORK_OPTIONS.map((m) => (
              <button key={m} type="button" className={m === workMin ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => changeInterval(m)}>{m} {t.min}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="tool-actions bt-actions">
        <button type="button" className="tool-btn primary" onClick={toggle}>{running ? t.pause : t.start}</button>
        <button type="button" className="tool-btn ghost" onClick={reset}>{t.reset}</button>
        <label className="bt-sound">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          {t.sound}
        </label>
        {perm === 'default' && <button type="button" className="tool-btn" onClick={askPermission}>🔔 {t.notifyAsk}</button>}
        {perm === 'granted' && <span className="bt-sound">🔔 {t.notifyOn}</span>}
      </div>
      {perm === 'denied' && <p className="tool-local-note">{t.notifyDenied}</p>}
      {perm === 'unsupported' && <p className="tool-local-note">{t.notifyNo}</p>}

      <p className="bt-cycles">{t.cycles}: <strong>{cycles}</strong></p>
      <p className="tool-local-note">👁️ {t.hint}</p>
    </div>
  );
}

export default BreakTimer;
