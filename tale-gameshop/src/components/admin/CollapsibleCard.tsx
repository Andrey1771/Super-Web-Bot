import React, { useState } from 'react';

interface CollapsibleCardProps {
  title: string;
  /** Раскрыта ли карточка по умолчанию. По умолчанию свёрнута — чтобы страница не была стеной. */
  defaultOpen?: boolean;
  /** Необязательная сводка справа от заголовка (напр. счётчик), видна и в свёрнутом виде. */
  summary?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Сворачиваемая admin-карточка: клик по заголовку открывает/закрывает содержимое.
 * Нужна, чтобы длинные редакторы (Game details и т.п.) не вываливались одной стеной.
 */
const CollapsibleCard: React.FC<CollapsibleCardProps> = ({ title, defaultOpen = false, summary, children }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="admin-card">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
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
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
};

export default CollapsibleCard;
