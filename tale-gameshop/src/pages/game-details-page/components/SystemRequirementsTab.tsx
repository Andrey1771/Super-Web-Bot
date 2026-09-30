import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameSystemRequirementBlock, GameSystemRequirementSpec, GameSystemRequirements } from '../../../types/game-details';

// Подписи строк — в словаре sysreq.<key>.
// Только текстовые строки: словарь переводов notesI18n сервер уже подставил в notes.
const SPEC_ROWS: { key: 'os' | 'cpu' | 'ram' | 'gpu' | 'storage' | 'notes' }[] = [
  { key: 'os' },
  { key: 'cpu' },
  { key: 'ram' },
  { key: 'gpu' },
  { key: 'storage' },
  { key: 'notes' }
];

const hasAnyValue = (spec?: GameSystemRequirementSpec | null) =>
  Boolean(spec) && SPEC_ROWS.some(({ key }) => Boolean(spec![key]?.toString().trim()));

const SpecTable = ({ spec }: { spec: GameSystemRequirementSpec }) => {
  const { t } = useTranslation();
  return (
    <div className="detail-rows">
      {SPEC_ROWS.filter(({ key }) => spec[key]?.toString().trim()).map(({ key }) => (
        <div key={key} className="detail-row">
          <span className="detail-label">{t(`sysreq.${key}`)}</span>
          <span className="detail-value">{spec[key]}</span>
        </div>
      ))}
    </div>
  );
};

/** Есть ли у игры хоть какие-то системные требования — по этому вкладка показывается или нет. */
export const hasSystemRequirements = (requirements?: GameSystemRequirements | null) => {
  if (!requirements) return false;
  return (['windows', 'mac', 'linux'] as const).some((os) => {
    const block = requirements[os];
    return hasAnyValue(block?.minimum) || hasAnyValue(block?.recommended);
  });
};

/**
 * Системные требования: переключатель ОС (только те, для которых что-то заполнено) и
 * «минимальные / рекомендуемые» рядом. Пустые строки не рендерятся — раньше таблица из шести
 * пустых полей OS/CPU/RAM/… показывалась у каждой игры.
 */
const SystemRequirementsTab = ({ requirements }: { requirements: GameSystemRequirements }) => {
  const { t } = useTranslation();
  const osTabs = useMemo(
    () =>
      (
        [
          { key: 'windows', label: 'Windows' },
          { key: 'mac', label: 'macOS' },
          { key: 'linux', label: 'Linux' }
        ] as const
      ).filter(({ key }) => {
        const block = requirements[key] as GameSystemRequirementBlock | undefined;
        return hasAnyValue(block?.minimum) || hasAnyValue(block?.recommended);
      }),
    [requirements]
  );
  const [activeOs, setActiveOs] = useState<string>(osTabs[0]?.key ?? 'windows');
  const block = (requirements[(osTabs.some((t) => t.key === activeOs) ? activeOs : osTabs[0]?.key) as 'windows' | 'mac' | 'linux'] ??
    null) as GameSystemRequirementBlock | null;

  if (!block || osTabs.length === 0) {
    return null;
  }

  const showMinimum = hasAnyValue(block.minimum);
  const showRecommended = hasAnyValue(block.recommended);

  return (
    <section className="game-details-section" id="system-requirements">
      <div className="card sysreq-card">
        <div className="sysreq-head">
          <h2>{t('product.tabs.sysreq')}</h2>
          {osTabs.length > 1 && (
            <div className="sysreq-os" role="tablist" aria-label={t('sysreq.osAria')}>
              {osTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeOs === tab.key}
                  className={`sysreq-os__btn${activeOs === tab.key ? ' is-active' : ''}`}
                  onClick={() => setActiveOs(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={`sysreq-grid${showMinimum && showRecommended ? ' sysreq-grid--two' : ''}`}>
          {showMinimum && (
            <div>
              <h3>{t('sysreq.minimum')}</h3>
              <SpecTable spec={block.minimum} />
            </div>
          )}
          {showRecommended && block.recommended && (
            <div>
              <h3>{t('sysreq.recommended')}</h3>
              <SpecTable spec={block.recommended} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default SystemRequirementsTab;
