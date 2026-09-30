import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renderMarkdown } from '../../../utils/markdown';
import type { AwardBadge } from '../../../types/game-details';

/**
 * Описание игры в левой колонке хиро, а не во вкладке Overview. Пока оно жило под вкладками,
 * правая колонка обрывалась сразу за карточкой покупки, и рядом с ней оставалась пустая полоса
 * во всю высоту. Теперь описание идёт вплотную за галереей и заполняет её.
 *
 * Свёрнутое состояние ограничено по высоте, а не по числу символов: markdown из админки
 * непредсказуем по разметке, и обрезка по тексту ломала бы списки и заголовки.
 */

// Высота свёрнутого блока. Примерно 8–9 строк — достаточно, чтобы понять, о чём игра,
// и не столько, чтобы описание вытеснило собой всё остальное.
const COLLAPSED_HEIGHT = 220;

type GameAboutProps = {
  descriptionMarkdown: string;
  features: string[];
  awards: AwardBadge[];
  /** Чем назвать товар в заголовке: «About this game» или «About this software». */
  noun?: 'game' | 'software';
};

const GameAbout = ({ descriptionMarkdown, features, awards, noun = 'game' }: GameAboutProps) => {
  const { t } = useTranslation();
  const description = descriptionMarkdown?.trim() ?? '';
  const hasFeatures = features.length > 0;
  const hasAwards = awards.length > 0;

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Кнопка нужна только если контент реально не влезает: у короткого описания
  // «Read more» выглядел бы обманом — разворачивать нечего.
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) {
      return;
    }
    const measure = () => setOverflows(el.scrollHeight > COLLAPSED_HEIGHT + 8);
    measure();
    // Ширина колонки меняется при ресайзе — вместе с ней и высота текста.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [description, features, awards]);

  if (!description && !hasFeatures && !hasAwards) {
    return null;
  }

  return (
    <section className="gd-about card" id="overview" aria-labelledby="gd-about-title">
      <h2 id="gd-about-title">{t(`product.about.${noun}`)}</h2>

      <div
        ref={bodyRef}
        className={`gd-about__body${!expanded && overflows ? ' is-collapsed' : ''}`}
        style={!expanded && overflows ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
      >
        {/* Описание — markdown из админки (заголовки, списки, ссылки); санитизируется в renderMarkdown. */}
        {description && <div className="gd-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(description) }} />}

        {hasFeatures && (
          <div className="features">
            <h3>{t('product.keyFeatures')}</h3>
            <ul>
              {features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        )}

        {hasAwards && (
          <div className="awards">
            <h3>{t('product.awards')}</h3>
            <div className="award-row">
              {awards.map((award) => (
                <span key={`${award.title}-${award.year ?? ''}`} className="award-pill" title={award.type ?? undefined}>
                  {award.iconUrl ? <img className="award-icon" src={award.iconUrl} alt="" /> : <span aria-hidden="true">🏆</span>}
                  <span>
                    {award.title}
                    {award.type ? <span className="award-year"> · {award.type}</span> : null}
                    {award.year ? <span className="award-year"> · {award.year}</span> : null}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {overflows && (
        <button
          type="button"
          className="gd-about__toggle"
          aria-expanded={expanded}
          aria-controls="gd-about-title"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t('common.showLess') : t('common.readMore')}
        </button>
      )}
    </section>
  );
};

export default GameAbout;
