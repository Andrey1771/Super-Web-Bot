import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { analyticsClient } from '../../../utils/analytics-client';

// 404 в стиле магазина. Используется и как общий catch-all, и когда залогиненный
// пользователь без нужных ролей открывает служебный маршрут (не подтверждаем, что он существует).
const NotFoundPage: React.FC = () => {
    const { t } = useTranslation();
    // Куда не дошли и откуда шли. Битые ссылки иначе не находятся вовсе: посетитель
    // просто уходит, и в отчётах это выглядит обычным выходом со страницы.
    useEffect(() => {
        analyticsClient.trackEvent('page_not_found', {
            page_path: window.location.pathname,
            referrer: document.referrer || 'direct',
        });
    }, []);

    return (
        <div className="min-h-screen bg-[#f6f2fb] text-[#2b2350]">
            <div className="pointer-events-none fixed left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(204,190,255,0.55)_0%,rgba(246,242,251,0.1)_70%)] blur-3xl" />
            <main className="container relative z-10 flex min-h-screen flex-col items-center justify-center px-4 text-center">
                <div className="text-[96px] font-semibold leading-none text-[#6b3ff2] sm:text-[128px]">404</div>
                <h1 className="mt-4 text-2xl font-semibold text-[#2b2350] sm:text-3xl">{t('notFound.title')}</h1>
                <p className="mt-3 max-w-md text-base text-[#6c6393]">{t('notFound.text')}</p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <Link
                        to="/"
                        className="rounded-[6px] bg-[#6b3ff2] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                    >
                        {t('notFound.goHome')}
                    </Link>
                    <Link
                        to="/games"
                        className="rounded-[6px] border border-[#d9d3ff] bg-white px-6 py-2.5 text-sm font-semibold text-[#6b3ff2] shadow-sm transition hover:border-[#6b3ff2]"
                    >
                        {t('notFound.browseGames')}
                    </Link>
                </div>
            </main>
        </div>
    );
};

export default NotFoundPage;
