import React, { useEffect, useState } from 'react';
import type { PriceBucket } from '../../api/catalogApi';

export type PriceRangeFilterProps = {
    /** Границы по всему каталогу — предел, дальше которого ручки не уезжают. */
    min: number;
    max: number;
    /** Текущий выбор. */
    from: number;
    to: number;
    /** Распределение цен: рисуется фоном, чтобы было видно, где вообще лежит товар. */
    histogram: PriceBucket[];
    onChange: (from: number, to: number) => void;
};

/** Высота области графика в пользовательских единицах viewBox. */
const CHART_HEIGHT = 40;

/**
 * Цена с распределением товара.
 *
 * График здесь не украшение: без него диапазон выбирают вслепую и регулярно попадают
 * в пустой промежуток. Видно, где скапливаются игры, — видно и куда тянуть ручку.
 *
 * Ручек две, и обе двигаются: одна задавала только потолок, а нижнюю границу приходилось
 * вводить числом.
 */
const PriceRangeFilter: React.FC<PriceRangeFilterProps> = ({ min, max, from, to, histogram, onChange }) => {
    // Пока тянут ручку, значение живёт локально: иначе каждый пиксель движения уходил бы
    // в адресную строку и в запрос к серверу.
    const [draft, setDraft] = useState<[number, number]>([from, to]);

    useEffect(() => {
        setDraft([from, to]);
    }, [from, to]);

    const span = Math.max(1, max - min);
    const peak = Math.max(1, ...histogram.map((bucket) => bucket.count));
    const percentOf = (value: number) => ((value - min) / span) * 100;

    const [draftFrom, draftTo] = draft;
    const commit = (next: [number, number]) => {
        setDraft(next);
        onChange(next[0], next[1]);
    };

    /** Столбики рисуем как ломаную: заливка под ней читается лучше, чем частокол делений. */
    const areaPoints = histogram.length > 0
        ? histogram
              .map((bucket, index) => {
                  const x = (index / Math.max(1, histogram.length - 1)) * 100;
                  const y = CHART_HEIGHT - (bucket.count / peak) * CHART_HEIGHT;
                  return `${x.toFixed(2)},${y.toFixed(2)}`;
              })
              .join(' ')
        : '';

    return (
        <div className="price-filter">
            {histogram.length > 0 && (
                <div className="price-filter-chart" aria-hidden="true">
                    {/* Выбранный участок остаётся цветным, отсечённое гасится — так сразу
                        видно, какую часть каталога отбросил фильтр. */}
                    <div
                        className="price-filter-chart-mask"
                        style={{ left: 0, width: `${percentOf(draftFrom)}%` }}
                    />
                    <div
                        className="price-filter-chart-mask"
                        style={{ left: `${percentOf(draftTo)}%`, right: 0, width: 'auto' }}
                    />
                    <svg viewBox={`0 0 100 ${CHART_HEIGHT}`} preserveAspectRatio="none">
                        <polygon points={`0,${CHART_HEIGHT} ${areaPoints} 100,${CHART_HEIGHT}`} />
                        <polyline points={areaPoints} />
                    </svg>
                </div>
            )}

            <div className="price-filter-track">
                <div
                    className="price-filter-selected"
                    style={{ left: `${percentOf(draftFrom)}%`, width: `${percentOf(draftTo) - percentOf(draftFrom)}%` }}
                />
                <input
                    type="range"
                    min={min}
                    max={max}
                    value={draftFrom}
                    aria-label="Minimum price"
                    onChange={(event) => setDraft([Math.min(Number(event.target.value), draftTo), draftTo])}
                    onMouseUp={() => commit(draft)}
                    onTouchEnd={() => commit(draft)}
                    onKeyUp={() => commit(draft)}
                />
                <input
                    type="range"
                    min={min}
                    max={max}
                    value={draftTo}
                    aria-label="Maximum price"
                    onChange={(event) => setDraft([draftFrom, Math.max(Number(event.target.value), draftFrom)])}
                    onMouseUp={() => commit(draft)}
                    onTouchEnd={() => commit(draft)}
                    onKeyUp={() => commit(draft)}
                />
            </div>

            <div className="price-filter-values">
                <span>${Math.round(draftFrom)}</span>
                <span>${Math.round(draftTo)}</span>
            </div>
        </div>
    );
};

export default PriceRangeFilter;
