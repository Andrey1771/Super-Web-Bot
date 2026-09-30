import React from "react";

/**
 * Декор тёмной панели «Our purpose».
 *
 * Первая версия была набором фигур в правом углу — карточка, крестовина, кнопки, ключ — и
 * читалась россыпью клипарта: предметы ничем не связаны, а левая половина оставалась пустой.
 * Здесь вместо предметов одна линия: она входит слева под текстом, проходит через всю панель
 * и разрешается справа вспышкой искр. Панель перестаёт делиться на «текстовую» и «пустую»
 * половины — через неё что-то проходит.
 *
 * Смысл читается без подписи: путь от заказа к выдаче. Слева линия почти не видна, чтобы не
 * спорить с текстом; к правому краю набирает яркость, где место свободно.
 *
 * Форма искр — четырёхлучевая с вогнутыми сторонами, та же, что в знаке магазина, чтобы декор
 * был из словаря сайта, а не откуда-то ещё.
 *
 * Чисто фоновый слой: aria-hidden, не ловит курсор, лежит под содержимым по z-index.
 */

/** Четырёхлучевая искра с вогнутыми сторонами — форма из знака магазина. */
const sparkle = (cx: number, cy: number, r: number) => {
    const i = r * 0.3;
    const c = r * 0.135;
    return `M${cx} ${cy - r}`
        + `C${cx + c} ${cy - i} ${cx + i} ${cy - c} ${cx + r} ${cy}`
        + `C${cx + i} ${cy + c} ${cx + c} ${cy + i} ${cx} ${cy + r}`
        + `C${cx - c} ${cy + i} ${cx - i} ${cy + c} ${cx - r} ${cy}`
        + `C${cx - i} ${cy - c} ${cx - c} ${cy - i} ${cx} ${cy - r}Z`;
};

/** Основная траектория: входит слева внизу, уходит вправо вверх. */
const TRAIL = "M-60 452C140 452 300 430 470 372S820 224 1260 96";

/** Вторая линия чуть ниже — даёт глубину, а не вторую дорожку. */
const TRAIL_SOFT = "M-60 486C160 486 330 466 500 408S860 258 1260 128";

export default function PurposeArtwork() {
    return (
        <svg
            className="about-purpose-art"
            viewBox="0 0 1200 520"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                {/* Слева почти прозрачно — там текст. Справа ярче — там свободно. */}
                <linearGradient id="ap-trail" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.05" />
                    <stop offset="55%" stopColor="#c4b5fd" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0.55" />
                </linearGradient>
                <linearGradient id="ap-spark" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0.7" />
                </linearGradient>
                <radialGradient id="ap-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.42" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* Свечение в точке, куда линия приходит. */}
            <circle cx="1010" cy="150" r="230" fill="url(#ap-glow)" />

            <path d={TRAIL} stroke="url(#ap-trail)" strokeWidth="1.6" strokeLinecap="round" />
            <path
                d={TRAIL_SOFT}
                stroke="url(#ap-trail)"
                strokeWidth="1.2"
                strokeOpacity="0.45"
                strokeDasharray="3 12"
                strokeLinecap="round"
            />

            {/* Узлы на линии: слева едва заметные, дальше крупнее — движение слева направо. */}
            <g fill="url(#ap-trail)">
                <circle cx="96" cy="450" r="2.4" />
                <circle cx="286" cy="435" r="3" />
                <circle cx="470" cy="372" r="3.6" />
                <circle cx="676" cy="298" r="4.4" />
                <circle cx="852" cy="216" r="5.2" />
            </g>

            {/* Разрешение справа: искры от крупной к мелким — выдача состоялась. */}
            <g fill="url(#ap-spark)">
                <path d={sparkle(1004, 148, 30)} />
                <path d={sparkle(1092, 232, 16)} />
                <path d={sparkle(932, 244, 10)} />
                <path d={sparkle(1136, 122, 8)} />
            </g>
        </svg>
    );
}
