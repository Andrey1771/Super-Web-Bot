import React from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import './tile-icon.css';

/**
 * Настоящие границы рисунка значков FontAwesome 7 (x0, y0, x1, y1 в единицах холста) — замерены растеризацией.
 * Значки нарисованы под строку текста: у звезды верхний луч выходит за холст (y от −32), у галочки снизу пусто,
 * поэтому центр холста — не центр рисунка. Нет в таблице — берётся весь холст.
 */
const INK_BOUNDS: Record<string, [number, number, number, number]> = {
    star: [13, -32, 562, 493],
    crown: [16, 16, 559, 447],
    medal: [8, -25, 439, 511],
    trophy: [1, 0, 510, 511],
    check: [0, 64, 447, 479],
    lock: [0, -32, 383, 511],
};

/** Маска значка: svg с холстом, обрезанным по рисунку, — его центр и есть центр рисунка. */
export const tileIconMask = (icon: IconDefinition): string => {
    const [width, height, , , path] = icon.icon;
    const [x0, y0, x1, y1] = INK_BOUNDS[icon.iconName] ?? [0, 0, width - 1, height - 1];
    const d = Array.isArray(path) ? path.join(' ') : path;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0 + 1} ${y1 - y0 + 1}"><path d="${d}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

/**
 * Значок в квадратной плашке (уровни кэшбэка) — маской на самом элементе, а не вложенным svg.
 *
 * Вложенный svg браузер выравнивает по пикселям отдельно от плашки: карточки уровней тянутся по сетке, их край
 * попадает на дробный пиксель, и звезда уезжала влево на 0,5–1 px — на одной ширине окна ровно, на другой криво.
 * Маска рисуется вместе с элементом и округляется так же, как он. Цвет — currentColor плашки.
 *
 * size — сторона квадрата под рисунок в пикселях: чётная при чётной плашке, чтобы отступы были целыми.
 */
const TileIcon: React.FC<{ icon: IconDefinition; size: number }> = ({ icon, size }) => {
    const mask = tileIconMask(icon);
    return (
        <span
            className="tile-icon"
            aria-hidden="true"
            style={{ width: size, height: size, WebkitMaskImage: mask, maskImage: mask }}
        />
    );
};

export default TileIcon;
