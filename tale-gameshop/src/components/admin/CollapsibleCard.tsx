import React, { useState } from 'react';

interface CollapsibleCardProps {
  title: string;
  /** Раскрыта ли карточка по умолчанию. По умолчанию свёрнута — чтобы страница не была стеной. */
  defaultOpen?: boolean;
  /** Необязательная сводка справа от заголовка (напр. счётчик), видна и в свёрнутом виде. */
  summary?: React.ReactNode;
  /** Якорь секции: по нему к карточке прокручивают из панели «чего не хватает». */
  id?: string;
  /**
   * Управляемый режим. Если open передан, карточка не хранит состояние сама — им распоряжается
   * страница. Нужно, чтобы клик по замечанию в панели полноты раскрывал нужную секцию.
   */
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}

/**
 * Сворачиваемая admin-карточка: клик по заголовку открывает/закрывает содержимое.
 * Нужна, чтобы длинные редакторы (Game details и т.п.) не вываливались одной стеной.
 */
const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  title,
  defaultOpen = false,
  summary,
  id,
  open: openProp,
  onToggle,
  children,
}) => {
  const [selfOpen, setSelfOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : selfOpen;

  return (
    <div className="admin-card" id={id}>
      <button
        type="button"
        onClick={() => (isControlled ? onToggle?.() : setSelfOpen((prev) => !prev))}
        aria-expanded={open}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          font: 'inherit',
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', fontSize: 13 }}>
          {summary}
          <span
            aria-hidden="true"
            style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', fontSize: 12 }}
          >
            ▶
          </span>
        </span>
      </button>
      {/* Тело раздела — сетка с зазором, а не голый div. Блоки внутри (ряды полей, описание,
          списки) стояли вплотную друг к другу: у сеток есть свой gap внутри, но между
          соседними блоками не было ничего, и раздел выглядел слипшимся. */}
      {open && <div className="admin-card__body">{children}</div>}
    </div>
  );
};

export default CollapsibleCard;
