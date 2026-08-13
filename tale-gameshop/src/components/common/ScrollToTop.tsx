import { useEffect } from 'react';
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
 * - смена только query-параметров (фильтры каталога, ?tag= в ленте) скролл
 *   не сбрасывает — эффект следит лишь за pathname.
 */
export default function ScrollToTop() {
    const { pathname, hash } = useLocation();
    const navigationType = useNavigationType();

    useEffect(() => {
        if (hash || navigationType === 'POP') {
            return;
        }
        window.scrollTo({ top: 0 });
    }, [pathname, hash, navigationType]);

    return null;
}
