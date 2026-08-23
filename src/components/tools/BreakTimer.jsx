import { useEffect, useRef, useState } from 'react';

// Таймер 20-20-20: каждые 20 минут — 20 секунд смотреть на 20 метров вдаль.
// Работает локально. По окончании фазы — короткий бип через Web Audio.

const WORK_SECONDS = 20 * 60;
const REST_SECONDS = 20;

const TEXT = {
  ru: {
    work: 'До перерыва', rest: 'Отдых для глаз', restHint: 'Смотрите вдаль ~20 метров',
    start: 'Старт', pause: 'Пауза', reset: 'Сброс',
    done: 'Готово! Возвращайтесь к работе', cycles: 'Циклов пройдено',
    hint: 'Правило 20-20-20 снижает усталость глаз при работе за экраном.',
    sound: 'Звук',
  },
  en: {
    work: 'Until break', rest: 'Eye rest', restHint: 'Look ~20 meters away',
    start: 'Start', pause: 'Pause', reset: 'Reset',
    done: 'Done! Back to work', cycles: 'Cycles done',
    hint: 'The 20-20-20 rule reduces eye strain from screen work.',
    sound: 'Sound',
  },
};

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch { /* ignore */ }
}

function BreakTimer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [phase, setPhase] = useState('work'); // 'work' | 'rest'
  const [left, setLeft] = useState(WORK_SECONDS);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [sound, setSound] = useState(true);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      setLeft((prev) => {
        if (prev > 1) return prev - 1;
        // фаза закончилась
        if (soundRef.current) beep();
        setPhase((ph) => {
          if (ph === 'work') return 'rest';
          setCycles((c) => c + 1);
          return 'work';
        });
        return prev; // временно; следующий эффект выставит длительность
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // При смене фазы выставляем длительность.
  useEffect(() => {
    setLeft(phase === 'work' ? WORK_SECONDS : REST_SECONDS);
  }, [phase]);

  const total = phase === 'work' ? WORK_SECONDS : REST_SECONDS;
  const progress = 1 - left / total;

  function reset() {
    setRunning(false);
    setPhase('work');
    setLeft(WORK_SECONDS);
    setCycles(0);
  }

  return (
    <div className={`tool-panel break-timer phase-${phase}`}>
      <div className="bt-dial" style={{ '--bt-progress': progress }}>
        <div className="bt-dial-inner">
          <span className="bt-phase">{phase === 'work' ? t.work : t.rest}</span>
          <span className="bt-time">{fmt(left)}</span>
          {phase === 'rest' && <span className="bt-resthint">{t.restHint}</span>}
        </div>
      </div>

      <div className="tool-actions bt-actions">
        <button type="button" className="tool-btn primary" onClick={() => setRunning((v) => !v)}>
          {running ? t.pause : t.start}
        </button>
        <button type="button" className="tool-btn ghost" onClick={reset}>{t.reset}</button>
        <label className="bt-sound">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          {t.sound}
        </label>
      </div>

      <p className="bt-cycles">{t.cycles}: <strong>{cycles}</strong></p>
      <p className="tool-local-note">👁️ {t.hint}</p>
    </div>
  );
}

export default BreakTimer;
