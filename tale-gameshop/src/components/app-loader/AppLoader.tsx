import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import './app-loader.css';
import logo from '../../assets/images/tale-shop-frog.svg';
import container from '../../inversify.config';
import IDENTIFIERS from '../../constants/identifiers';
import type { IKeycloakService } from '../../iterfaces/i-keycloak-service';

// Задержка перед показом: если Keycloak инициализируется быстрее — лоадер не появляется вовсе
// (никакого мигания). Контент при этом не задерживается, минимального времени показа нет.
const SHOW_DELAY_MS = 150;

// Через сколько признать, что инициализация не просто медленная, а зависла.
// Провайдер @react-keycloak при неудачном init НЕ выставляет initialized, и приложение
// осталось бы на этой заставке навсегда. Событие onInitError ловим отдельно — оно приходит,
// когда init отклонился; таймаут нужен на случай, когда init не отклоняется, а висит
// (например, скрытый iframe check-sso не получает ответа от неподнявшегося Keycloak).
const STALLED_AFTER_MS = 20000;

const AppLoader: React.FC = () => {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);
    const [stalled, setStalled] = useState(false);

    useEffect(() => {
        const showTimer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
        const stalledTimer = window.setTimeout(() => setStalled(true), STALLED_AFTER_MS);

        let emitter: IKeycloakService['stateChangedEmitter'] | undefined;
        const onInitError = () => setStalled(true);
        try {
            emitter = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService).stateChangedEmitter;
            emitter.on('onInitError', onInitError);
        } catch {
            // Контейнер недоступен — остаётся только таймаут, заставка всё равно не вечная.
        }

        return () => {
            window.clearTimeout(showTimer);
            window.clearTimeout(stalledTimer);
            emitter?.off('onInitError', onInitError);
        };
    }, []);

    if (stalled) {
        return (
            <div className="app-loader" role="alert">
                <div className="app-loader__stage">
                    <span className="app-loader__glow app-loader__glow--muted" />
                    <img className="app-loader__logo" src={logo} alt="Tale Shop" />
                </div>
                <div className="app-loader__text">
                    <div className="app-loader__brand">{t('loader.unavailable')}</div>
                    <div className="app-loader__tagline">
                        {t('loader.text')}
                    </div>
                </div>
                <button type="button" className="app-loader__retry" onClick={() => window.location.reload()}>
                    {t('common.tryAgain')}
                </button>
            </div>
        );
    }

    if (!visible) {
        return null;
    }

    // Обычное ожидание — тихий каркас, а не полноэкранное фирменное окно.
    //
    // Окно с логотипом на фиолетовом сиянии появлялось на секунду и исчезало, и это читалось
    // как сбой, а не как загрузка: заявка на событие там, где событие длится мгновение. Здесь
    // же остаётся шапка сайта, а в области содержимого проступает форма будущей страницы —
    // менять композицию при появлении данных не придётся, мелькать нечему.
    //
    // Фирменная композиция сохранена ровно для одного случая — когда ждать больше нельзя
    // (см. ветку stalled выше): там уже не загрузка, а разговор с человеком.
    return (
        <div className="app-loader-quiet" role="status" aria-live="polite" aria-busy="true">
            <span className="app-loader-quiet__line is-title" />
            <span className="app-loader-quiet__line" />
            <span className="app-loader-quiet__line is-short" />
            <div className="app-loader-quiet__card" />
            <span className="visually-hidden">{t('common.loading')}</span>
        </div>
    );
};

export default AppLoader;
