import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Глобальный сброс скролла при переходах.
 *
 * SPA позицию прокрутки сам не трогает: без этого страница, открытая из глубины
 * предыдущей (игра из низа каталога, раздел из подвала), появлялась прокрученной
 * на ту же глубину — посреди контента.
 *
 * Правила:
 * - обычный переход (PUSH/REPLACE) на другой путь — мгновенно к началу страницы;
 * - адрес с #якорем — не вмешиваемся: переходу к якорю виднее;
 * - «назад/вперёд» (POP) — не трогаем, чтобы не отбирать позицию у читателя;
 * - смена только query-параметров (фильтры каталога, ?tag= в ленте, ?page= у отзывов)
 *   скролл не сбрасывает: сравниваем pathname с предыдущим. Раньше эффект зависел ещё и
 *   от типа перехода, и смена страницы отзывов (PUSH после REPLACE вкладки) уносила к началу.
 */
export default function ScrollToTop() {
    const { pathname, hash } = useLocation();
    const navigationType = useNavigationType();
    const lastPathname = useRef<string | null>(null);

    useEffect(() => {
        const pathChanged = lastPathname.current !== pathname;
        lastPathname.current = pathname;
        if (!pathChanged || hash || navigationType === 'POP') {
            return;
        }
        window.scrollTo({ top: 0 });
    }, [pathname, hash, navigationType]);

    return null;
}
