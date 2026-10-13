import React from 'react';
import { useTranslation } from 'react-i18next';

export type GameTabId = 'overview' | 'reviews' | 'system-requirements';

export type GameTabDef = { id: GameTabId; label: string; count?: number };

/**
 * Вкладки под хиро. Активная хранится в `?tab=` — у отзывов и вопросов есть прямая ссылка,
 * а контент вкладки грузится только когда её открыли.
 */
const GameTabs = ({ tabs, active, onChange }: { tabs: GameTabDef[]; active: GameTabId; onChange: (id: GameTabId) => void }) => {
  const { t } = useTranslation();
  return (
  <nav className="gd-tabs" aria-label={t('product.sections')}>
    <div className="gd-tabs__inner" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id}`}
          className={`gd-tab${active === tab.id ? ' is-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.count === 'number' && tab.count > 0 ? <span className="gd-tab__count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  </nav>
  );
};

export default GameTabs;
