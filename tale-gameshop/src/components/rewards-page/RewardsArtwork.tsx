import React from "react";

/**
 * Иллюстрации страницы кэшбэка.
 *
 * Флэт-вектор в наших цветах — тот же язык, что у карточек витрины на главной (heroArt).
 * Фотографий и чужих игровых персонажей здесь нет намеренно: у конкурента на первом экране
 * стоят герои чужих игр, и это права издателей, а не наш арт. Рисуем то, что продаём мы —
 * ключ и монеты.
 *
 * Стопка монет повторяет ту, что стоит в промо-карточке «Cashback on every order» на главной:
 * с неё человек сюда и приходит, и картинка должна продолжаться, а не начинаться заново.
 * Валютного знака на монетах нет — магазин мультивалютный, и «$» на витрине с евро врёт.
 *
 * Анимация (rewards-page.css, раздел «Движение») рассказывает то же, что текст: ключ
 * поворачивается, как в замке, — щелчок — монеты по одной ложатся в стопку и часть
 * разлетается. У конкурента блоки просто въезжают с краёв; здесь движение и есть объяснение.
 * Классы rw-* — крючки только для неё; без CSS рисунок выглядит так же, просто неподвижно.
 */

/** CSS-переменные в style: React не знает про «--i», поэтому приводим тип один раз здесь. */
const vars = (values: Record<string, string | number>) => values as React.CSSProperties;

/** Монета стопки. `i` — очередь падения, снизу вверх. */
const Coin: React.FC<{ cy: number; fill: string; i: number }> = ({ cy, fill, i }) => (
    <ellipse className="rw-coin" style={vars({ "--i": i })} cx="270" cy={cy} rx="96" ry="33" fill={fill} />
);

/** Центр стопки: отсюда разлетаются монеты. */
const STACK_X = 270;
const STACK_Y = 280;

/**
 * Отдельная монета в полёте: тело, ободок и сплюснутость по вертикали — она повёрнута
 * к зрителю не плашмя. Без ободка плоский овал не читается как монета.
 *
 * Три обёртки — три независимых движения: вылет из стопки, покачивание в воздухе и
 * редкий переворот. На одном элементе они бы спорили за один transform.
 */
const FlyingCoin: React.FC<{ cx: number; cy: number; r: number; i: number }> = ({ cx, cy, r, i }) => (
    <g className="rw-fly" style={vars({ "--i": i, "--dx": `${STACK_X - cx}px`, "--dy": `${STACK_Y - cy}px` })}>
        <g className="rw-fly-bob">
            <g className="rw-fly-spin">
                <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.82} fill="#1c8f57" />
                <ellipse cx={cx} cy={cy - r * 0.06} rx={r * 0.86} ry={r * 0.68} fill="#34d17e" />
                <ellipse cx={cx} cy={cy - r * 0.06} rx={r * 0.44} ry={r * 0.34} fill="#1c8f57" opacity=".35" />
            </g>
        </g>
    </g>
);

export const RewardsHeroArt: React.FC = () => (
    <svg className="rewards-hero-art" viewBox="0 0 520 420" fill="none" aria-hidden="true" focusable="false">
        <defs>
            <radialGradient id="rw-glow" cx="52%" cy="48%" r="55%">
                <stop offset="0" stopColor="#8b5cf6" stopOpacity=".38" />
                <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
            </radialGradient>
            {/* Блик пробегает только по стержню, не вылезая за контур ключа. */}
            <clipPath id="rw-key-clip">
                <circle cx="138" cy="130" r="42" />
                <rect x="172" y="117" width="196" height="26" rx="8" />
            </clipPath>
        </defs>

        <circle className="rw-glow" cx="270" cy="200" r="210" fill="url(#rw-glow)" />

        {/* Слои глубины двигаются за курсором с разной силой — ключ ближе, стопка дальше. */}
        <g className="rw-depth rw-depth-key">
            <g className="rw-key">
                {/* Ключ — то, что покупают. Наклон небольшой: сильнее и он начинает спорить со стопкой. */}
                <g transform="rotate(-16 250 130)">
                    <circle cx="138" cy="130" r="42" fill="#8b5cf6" />
                    <circle cx="138" cy="130" r="18" fill="#141026" />
                    <rect x="172" y="117" width="196" height="26" rx="8" fill="#8b5cf6" />
                    <rect x="300" y="143" width="19" height="32" rx="5" fill="#8b5cf6" />
                    <rect x="338" y="143" width="19" height="24" rx="5" fill="#8b5cf6" />
                    {/* Блик вдоль стержня: плоская фигура без него читается как серая полоса. */}
                    <rect x="180" y="122" width="178" height="7" rx="3.5" fill="#b79bff" opacity=".7" />
                    <g clipPath="url(#rw-key-clip)">
                        <path className="rw-key-glint" d="M92 80h22l-40 110H52z" fill="#ffffff" />
                    </g>
                    {/* «Щелчок» замка: кольцо расходится от головки в момент поворота. */}
                    <circle className="rw-key-click" cx="138" cy="130" r="46" stroke="#c4a9ff" strokeWidth="3" />
                </g>
            </g>
        </g>

        {/* Стопка монет — то, что возвращается. */}
        <g className="rw-depth rw-depth-stack">
            <Coin cy={330} fill="#1c8f57" i={0} />
            <Coin cy={308} fill="#2bb56e" i={1} />
            <Coin cy={286} fill="#1c8f57" i={2} />
            <Coin cy={264} fill="#2bb56e" i={3} />
            <Coin cy={242} fill="#34d17e" i={4} />
            {/* Прозрачность на обёртке: анимация падения крутит opacity у самой монеты,
                и атрибут на эллипсе она бы перебила до 1. */}
            <g opacity=".35">
                <ellipse className="rw-coin" style={vars({ "--i": 4 })} cx="270" cy="242" rx="58" ry="19" fill="#1c8f57" />
            </g>
        </g>

        {/* Разлетающиеся монеты. Сначала были узкими эллипсами «ребром» — на тёмном фоне они
            читались как листья. Монету делает не наклон, а ободок: светлое тело, тёмная
            сердцевина и толстый край. */}
        <g className="rw-depth rw-depth-fly">
            <FlyingCoin cx={86} cy={252} r={22} i={0} />
            <FlyingCoin cx={438} cy={222} r={18} i={1} />
            <FlyingCoin cx={456} cy={322} r={14} i={2} />
            <FlyingCoin cx={58} cy={338} r={16} i={3} />
        </g>

        {/* Искры — те же четырёхлучевые звёздочки, что на витрине. */}
        <path className="rw-spark" style={vars({ "--i": 0 })} d="M430 96l4.4 11.4 11.4 4.4-11.4 4.4-4.4 11.4-4.4-11.4-11.4-4.4 11.4-4.4z" fill="#c4a9ff" />
        <path className="rw-spark" style={vars({ "--i": 1 })} d="M62 148l3.2 8.3 8.3 3.2-8.3 3.2-3.2 8.3-3.2-8.3-8.3-3.2 8.3-3.2z" fill="#8b5cf6" />
        <path className="rw-spark" style={vars({ "--i": 2 })} d="M486 168l2.6 6.8 6.8 2.6-6.8 2.6-2.6 6.8-2.6-6.8-6.8-2.6 6.8-2.6z" fill="#a985ff" opacity=".9" />
    </svg>
);

/**
 * Чек заказа с отдельной строкой кэшбэка.
 *
 * Показывает ровно то, о чём спорят в тексте: процент считается с суммы ПОСЛЕ скидки, а
 * начисление — это не уменьшение счёта, а отдельная строка «вернётся». У конкурента на этом
 * месте макеты телефонов; они красивые, но ничего не объясняют.
 *
 * При появлении на экране чек «печатается» в том порядке, в каком его читают: товар, цена,
 * зачёркивание, итог — и последней выезжает зелёная строка. `--d` — задержка каждой части.
 */
export const RewardsReceiptArt: React.FC = () => (
    <svg className="rewards-receipt-art" viewBox="0 0 360 300" fill="none" aria-hidden="true" focusable="false">
        <defs>
            <linearGradient id="rw-card" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="1" stopColor="#f7f4ff" />
            </linearGradient>
        </defs>

        <g className="rw-r rw-r-card">
            <rect x="14" y="18" width="332" height="264" rx="22" fill="#ede8ff" />
            <rect x="26" y="6" width="308" height="264" rx="20" fill="url(#rw-card)" stroke="#e2daff" strokeWidth="2" />
        </g>

        {/* Шапка чека: обложка игры и две строки названия. */}
        <g className="rw-r rw-r-pop" style={vars({ "--d": "0.25s" })}>
            <rect x="50" y="32" width="58" height="58" rx="10" fill="#8b5cf6" />
            <rect x="64" y="52" width="30" height="7" rx="3.5" fill="#c4a9ff" />
            <rect x="64" y="65" width="20" height="7" rx="3.5" fill="#c4a9ff" />
        </g>
        <rect className="rw-r rw-r-line" style={vars({ "--d": "0.35s" })} x="122" y="42" width="142" height="11" rx="5.5" fill="#2c2354" />
        <rect className="rw-r rw-r-line" style={vars({ "--d": "0.45s" })} x="122" y="62" width="94" height="9" rx="4.5" fill="#b9b2d4" />

        <rect className="rw-r rw-r-line" style={vars({ "--d": "0.5s" })} x="50" y="110" width="260" height="2" rx="1" fill="#ece8ff" />

        {/* Строки суммы. Зачёркнутая цена и скидка — чтобы было видно, с чего именно считается процент. */}
        <rect className="rw-r rw-r-line" style={vars({ "--d": "0.6s" })} x="50" y="130" width="74" height="9" rx="4.5" fill="#b9b2d4" />
        <rect className="rw-r rw-r-line" style={vars({ "--d": "0.65s" })} x="236" y="130" width="74" height="9" rx="4.5" fill="#b9b2d4" />
        <rect className="rw-r rw-r-line" style={vars({ "--d": "0.95s" })} x="232" y="133" width="82" height="2" rx="1" fill="#e0483d" />

        <rect className="rw-r rw-r-line" style={vars({ "--d": "0.75s" })} x="50" y="158" width="96" height="9" rx="4.5" fill="#b9b2d4" />
        <rect className="rw-r rw-r-line" style={vars({ "--d": "1.05s" })} x="252" y="158" width="58" height="9" rx="4.5" fill="#2c2354" />

        <rect className="rw-r rw-r-line" style={vars({ "--d": "1.1s" })} x="50" y="186" width="260" height="2" rx="1" fill="#ece8ff" />

        {/* Та самая строка: отдельная, зелёная, под итогом. */}
        <g className="rw-r rw-r-cash">
            <rect x="42" y="204" width="276" height="52" rx="14" fill="#e7f7ee" />
            <g className="rw-r-coin">
                <circle cx="72" cy="230" r="16" fill="#34d17e" />
                <ellipse cx="72" cy="230" rx="8" ry="8" fill="#1c8f57" opacity=".35" />
            </g>
            <rect x="100" y="219" width="104" height="9" rx="4.5" fill="#1c8f57" />
            <rect x="100" y="234" width="72" height="7" rx="3.5" fill="#6aa98a" />
            <rect className="rw-r-amount" x="248" y="224" width="54" height="13" rx="6.5" fill="#1c8f57" />
        </g>
    </svg>
);
