// Сигнал о новом ответе поддержки, когда чат свёрнут или клиент ушёл на другую вкладку:
// короткий звук плюс мигание заголовка вкладки. Оба способа не требуют разрешений браузера —
// системные уведомления просить не стали, всплывающий запрос прав на витрине магазина пугает.

// --- Звук ----------------------------------------------------------------

// Синтезируем две ноты вместо звукового файла: не тянем в бандл лишний ресурс и не зависим
// от того, доедет ли статика. Контекст создаём один на страницу и лениво — до первого сигнала
// он не нужен, а браузеры ругаются на созданные «про запас» аудиоконтексты.
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (audioContext) {
    return audioContext;
  }
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  try {
    audioContext = new Ctor();
    return audioContext;
  } catch {
    return null;
  }
};

const NOTES = [
  { frequency: 880, offset: 0 },
  { frequency: 1174.7, offset: 0.11 },
];

export const playIncomingChime = () => {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  // Без жеста пользователя контекст остаётся приостановленным — до первого клика по странице
  // звука просто не будет, и это нормально: ронять из-за него ничего нельзя.
  if (context.state === "suspended") {
    void context.resume().catch(() => undefined);
  }

  try {
    const startedAt = context.currentTime;
    NOTES.forEach(({ frequency, offset }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = startedAt + offset;

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      // Через экспоненту, а не ступенькой: резкий старт и обрыв дают щелчок.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.1, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.2);
    });
  } catch {
    // Звук — приятное дополнение, а не функциональность: молча обходимся без него.
  }
};

// --- Заголовок вкладки ---------------------------------------------------

const FLASH_INTERVAL_MS = 1200;

let flashTimer: number | null = null;
let restoredTitle = "";

export const startTitleFlash = (message: string) => {
  if (typeof document === "undefined" || flashTimer !== null) {
    return;
  }

  restoredTitle = document.title;
  let showMessage = true;
  flashTimer = window.setInterval(() => {
    document.title = showMessage ? message : restoredTitle;
    showMessage = !showMessage;
  }, FLASH_INTERVAL_MS);
  document.title = message;
};

export const stopTitleFlash = () => {
  if (flashTimer === null) {
    return;
  }
  window.clearInterval(flashTimer);
  flashTimer = null;
  if (restoredTitle) {
    document.title = restoredTitle;
  }
};
