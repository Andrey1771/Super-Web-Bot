import React from "react";

// Иконки виджета одной семьёй: контур, толщина 1.8, скруглённые концы — как у пузыря
// на кнопке вызова. Раньше в шапке стояли текстовые глифы вроде «×» и «↓»: они берутся
// из системного шрифта, поэтому на каждой ОС были своего размера и веса.

type IconProps = {
  className?: string;
};

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: "false" as const,
};

export const CloseIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    {/* Крест крупнее стрелок по габариту (12 против 14.4): при равном размере он читается мельче. */}
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

// Динамик у обеих иконок один и тот же — меняются только волны на перечёркивание,
// поэтому при переключении фигура не «прыгает».
const SpeakerBody = () => <path d="M5.2 9.6h3L11.7 6.6v10.8L8.2 14.4h-3a.6.6 0 0 1-.6-.6v-3.6a.6.6 0 0 1 .6-.6Z" />;

export const SoundOnIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <SpeakerBody />
    <path d="M14.6 9.9a3 3 0 0 1 0 4.2" />
    <path d="M17 7.7a6.2 6.2 0 0 1 0 8.6" />
  </svg>
);

export const SoundOffIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <SpeakerBody />
    <path d="m15.2 10.4 3.6 3.6M18.8 10.4l-3.6 3.6" />
  </svg>
);

// Аватары — заливка, а не контур: в кружке 28px обводка превращается в кашу.
// Рисуем фигурами, а не эмодзи: эмодзи в каждой ОС свои и рядом с фирменным стилем
// выглядят заглушкой.
export const BotAvatarIcon: React.FC<IconProps> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
    <circle cx="12" cy="3.2" r="1.5" fill="currentColor" />
    <path d="M12 4.2v2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="4" y="6.8" width="16" height="12.4" rx="4.2" fill="currentColor" />
    <circle cx="9.4" cy="13" r="1.5" fill="#fff" />
    <circle cx="14.6" cy="13" r="1.5" fill="#fff" />
  </svg>
);

export const AgentAvatarIcon: React.FC<IconProps> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
    <path d="M5 12.6v-.8a7 7 0 0 1 14 0v.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <rect x="2.8" y="12" width="4.2" height="6.4" rx="1.8" fill="currentColor" />
    <rect x="17" y="12" width="4.2" height="6.4" rx="1.8" fill="currentColor" />
    <path d="M19.1 18.6v.6a2.6 2.6 0 0 1-2.6 2.6h-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
  </svg>
);

export const UserAvatarIcon: React.FC<IconProps> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
    <circle cx="12" cy="8.4" r="3.8" fill="currentColor" />
    <path
      d="M12 13.8c-4.1 0-7.4 2.5-7.4 5.6 0 .6.5 1 1.1 1h12.6c.6 0 1.1-.4 1.1-1 0-3.1-3.3-5.6-7.4-5.6Z"
      fill="currentColor"
    />
  </svg>
);

export const ArrowDownIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M12 5.5v13M6.6 13.2 12 18.6l5.4-5.4" />
  </svg>
);

/**
 * Самолётик залит, а не обведён. Контурная версия в 20 пикселях выглядела кривой: скруглённые
 * стыки съедали острый нос, а линия сгиба внутри упиралась в обводку и торчала лишним хвостом.
 * Силуэт из четырёх точек — нос, левый угол, выемка, нижний угол — читается сразу и в мелком
 * размере, и остаётся ровно по центру холста (габарит 17.2 × 17.2 при центре 12 × 12).
 */
export const SendIcon: React.FC<IconProps> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
    <path d="M20.6 3.4 3.4 10.9l6.9 2.8 2.8 6.9 7.5-17.2Z" fill="currentColor" />
  </svg>
);
