import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowUp,
    faCircleInfo,
    faClock,
    faFileLines,
    faLink,
    faTriangleExclamation
} from '@fortawesome/free-solid-svg-icons';
import { getSupportDocs } from '../../content/support/docs';
import { getLegalDetails, type LegalDetails } from '../../api/legalApi';
import { useCashbackProgram, type CashbackProgram } from '../../hooks/use-cashback-program';
import { fillCashbackTokens } from '../../content/support/cashback-terms';
import type { SupportDoc, SupportDocCallout } from '../../content/support/docs';
import './support-doc-page.css';

/** Якорь раздела — по номеру: одинаков на всех языках и не зависит от алфавита заголовка. */
const sectionAnchor = (index: number) => `section-${index + 1}`;

// Грубая оценка «минут чтения» по объёму текста — как в блоге, для ощущения ухоженной статьи.
const estimateReadingMinutes = (doc: SupportDoc): number => {
    const words = [
        doc.shortDescription,
        doc.intro ?? '',
        doc.callout?.text ?? '',
        ...doc.sections.flatMap((section) => [
            section.title,
            section.intro ?? '',
            section.callout?.text ?? '',
            ...section.bullets
        ])
    ]
        .join(' ')
        .split(/\s+/)
        .filter(Boolean).length;
    return Math.max(1, Math.round(words / 180));
};

/**
 * Подстановка реквизитов в текст документа.
 *
 * В текстах стоят токены вида {{entity}}, значения приходят с сервера. Незаполненное
 * значение НЕ подставляется пустой строкой — на его месте остаётся видная метка: пропуск
 * в условиях продажи должен бросаться в глаза, а не выглядеть законченной фразой.
 */
const fillLegalTokens = (text: string, legal: LegalDetails | null): string =>
    text.replace(/{{([A-Za-z]+)}}/g, (_match, key: string) => {
        const value = legal ? (legal as unknown as Record<string, string>)[key] : '';
        return value && value.trim() ? value : `[TO FILL: ${key}]`;
    });

/** Остались ли в документе незаполненные места после подстановки. */
const hasBlanks = (doc: SupportDoc, legal: LegalDetails | null, program: CashbackProgram): boolean => {
    const texts = [
        doc.lastUpdated,
        doc.intro ?? '',
        ...doc.sections.flatMap((section) => [
            section.intro ?? '',
            section.callout?.text ?? '',
            ...section.bullets
        ])
    ];
    return texts.some((text) => fillLegalTokens(fillCashbackTokens(text, program), legal).includes('[TO FILL:'));
};

/** Отступ сверху, ниже которого раздел считается «текущим»: под липкой шапкой сайта. */
const ACTIVE_SECTION_OFFSET = 140;

/** С какой прокрутки показывать кнопку «наверх». Меньше экрана — она бессмысленна. */
const BACK_TO_TOP_AFTER = 700;

const prefersReducedMotion = () =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Какой раздел человек читает сейчас и пора ли показывать кнопку «наверх».
 *
 * Текущим считается последний раздел, чей заголовок уже ушёл под шапку: пока следующий
 * не доехал до неё, читают этот. Обработчик один на оба вопроса и притормаживается кадром —
 * событие прокрутки приходит десятки раз в секунду, а перерисовка нужна редко.
 */
const useReadingPosition = (sectionIds: string[]) => {
    const [activeId, setActiveId] = useState<string | null>(sectionIds[0] ?? null);
    const [showBackToTop, setShowBackToTop] = useState(false);

    // Ключ, а не сам массив: он пересоздаётся на каждый рендер и перезапускал бы эффект.
    const key = sectionIds.join('|');

    useEffect(() => {
        const ids = key ? key.split('|') : [];
        let frame = 0;

        const measure = () => {
            frame = 0;
            setShowBackToTop(window.scrollY > BACK_TO_TOP_AFTER);

            let current = ids[0] ?? null;
            for (const id of ids) {
                const element = document.getElementById(id);
                if (element && element.getBoundingClientRect().top <= ACTIVE_SECTION_OFFSET) {
                    current = id;
                }
            }
            setActiveId(current);
        };

        const onScroll = () => {
            if (!frame) {
                frame = window.requestAnimationFrame(measure);
            }
        };

        measure();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            if (frame) {
                window.cancelAnimationFrame(frame);
            }
        };
    }, [key]);

    return { activeId, showBackToTop };
};

const Callout: React.FC<{ callout: SupportDocCallout }> = ({ callout }) => (
    <div className={`support-doc-callout is-${callout.tone}`}>
        <FontAwesomeIcon
            icon={callout.tone === 'warning' ? faTriangleExclamation : faCircleInfo}
            className="support-doc-callout-icon"
        />
        <div>
            {callout.title && <strong>{callout.title}</strong>}
            <p>{callout.text}</p>
        </div>
    </div>
);

const SupportDocPage: React.FC = () => {
    const { t } = useTranslation();
    const { docId } = useParams<{ docId: string }>();
    // На языке сайта: useTranslation перерисует страницу при смене языка.
    const supportDocs = getSupportDocs();
    const doc = supportDocs.find((item) => item.id === docId);

    const [legal, setLegal] = useState<LegalDetails | null>(null);
    // Сроки и минимум программы кэшбэка — из её настроек, чтобы условия не расходились с админкой.
    const cashbackProgram = useCashbackProgram();

    useEffect(() => {
        let cancelled = false;
        getLegalDetails()
            .then((details) => {
                if (!cancelled) {
                    setLegal(details);
                }
            })
            .catch(() => {
                // Сервер не ответил — документ покажет метки на месте реквизитов и
                // пометку «черновик». Молчаливых пустот в юридическом тексте быть не должно.
                if (!cancelled) {
                    setLegal(null);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Хуки — до раннего возврата: у ненайденного документа разделов просто нет.
    const { activeId, showBackToTop } = useReadingPosition(
        (doc?.sections ?? []).map((_section, index) => sectionAnchor(index))
    );

    const scrollToTop = useCallback(() => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }, []);

    if (!doc) {
        return (
            <div className="support-doc-page">
                <div className="container">
                    <div className="card support-doc-notfound">
                        <h1>{t('docs.notFound')}</h1>
                        <p>{t('docs.notFoundText')}</p>
                        <Link to="/support" className="btn btn-primary">
                            {t('common.backToSupport')}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const otherDocs = supportDocs.filter((item) => item.id !== doc.id);
    const readingMinutes = estimateReadingMinutes(doc);
    const fill = (text: string) => fillLegalTokens(fillCashbackTokens(text, cashbackProgram), legal);
    const blanks = hasBlanks(doc, legal, cashbackProgram);
    // Пока реквизиты не пришли, документ не объявляем черновиком: иначе предупреждение
    // мигало бы на каждой загрузке у полностью заполненного текста.
    const isDraft = legal ? blanks || legal.draft : false;

    return (
        <div className="support-doc-page">
            <div className="container">
                <div className="support-doc-breadcrumbs">
                    <Link to="/">{t('common.nav.home')}</Link>
                    <span>/</span>
                    <Link to="/support">{t('common.nav.support')}</Link>
                    <span>/</span>
                    <span>{doc.title}</span>
                </div>

                <div className="support-doc-layout">
                    <main className="support-doc-main">
                        <header className="card support-doc-hero">
                            <span className={`support-doc-kind is-${doc.kind}`}>
                                {doc.kind === 'policy' ? t('docs.policy') : t('docs.guide')}
                            </span>
                            <h1>{doc.title}</h1>
                            <p className="support-doc-lead">{fill(doc.intro ?? doc.shortDescription)}</p>
                            <div className="support-doc-meta">
                                <span>
                                    <FontAwesomeIcon icon={faClock} /> {t('docs.minRead', { count: readingMinutes })}
                                </span>
                                <span>{fill(doc.lastUpdated)}</span>
                                {doc.action && (
                                    <Link to={doc.action.to} className="btn btn-primary support-doc-action">
                                        {doc.action.label}
                                    </Link>
                                )}
                            </div>
                        </header>

                        {/* Пометка «черновик» ставится по факту, а не хранится в тексте:
                            либо в документе остались незаполненные реквизиты, либо в
                            настройках стоит Legal:Draft — текст ещё не смотрел юрист. */}
                        {isDraft && (
                            <Callout
                                callout={{
                                    tone: 'warning',
                                    title: t('docs.draftTitle'),
                                    text: blanks
                                        ? t('docs.draftBlanks')
                                        : t('docs.draftReview')
                                }}
                            />
                        )}
                        {doc.callout && <Callout callout={doc.callout} />}

                        {doc.sections.map((section, index) => (
                            <section
                                key={sectionAnchor(index)}
                                id={sectionAnchor(index)}
                                className="card support-doc-section"
                            >
                                <div className="support-doc-section-header">
                                    <span className="support-doc-section-num" aria-hidden="true">
                                        {index + 1}
                                    </span>
                                    <h2>{section.title}</h2>
                                    {/* Ссылка на конкретный пункт: по ней адрес в строке браузера
                                        указывает именно сюда, и в переписке с покупателем можно
                                        сослаться на пункт, а не пересказывать его. */}
                                    <a
                                        className="support-doc-section-anchor"
                                        href={`#${sectionAnchor(index)}`}
                                        aria-label={t('docs.linkToSection', { index: index + 1, title: section.title })}
                                    >
                                        <FontAwesomeIcon icon={faLink} />
                                    </a>
                                </div>
                                {section.intro && <p className="support-doc-section-intro">{fill(section.intro)}</p>}
                                {section.ordered ? (
                                    <ol className="support-doc-steps">
                                        {section.bullets.map((bullet, stepIndex) => (
                                            <li key={bullet}>
                                                <span className="support-doc-step-num" aria-hidden="true">
                                                    {stepIndex + 1}
                                                </span>
                                                <span>{fill(bullet)}</span>
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    <ul className="support-doc-list">
                                        {section.bullets.map((bullet) => (
                                            <li key={bullet}>{fill(bullet)}</li>
                                        ))}
                                    </ul>
                                )}
                                {section.callout && <Callout callout={{ ...section.callout, text: fill(section.callout.text) }} />}
                            </section>
                        ))}

                        {/* «Что ещё почитать» — в конце статьи, а не в боковой колонке.
                            В колонке она делила высоту с оглавлением: на окне ниже ~950px
                            оглавлению оставалось меньше его собственной высоты, и оно
                            получало полосу прокрутки. Здесь это ещё и уместнее — список
                            читается как «что дальше», когда документ дочитан. */}
                        <div className="card support-doc-related">
                            <h3>{t('docs.moreGuides')}</h3>
                            <ul>
                                {otherDocs.map((item) => (
                                    <li key={item.id}>
                                        <span className="support-doc-related-icon" aria-hidden="true">
                                            <FontAwesomeIcon icon={faFileLines} />
                                        </span>
                                        <Link to={item.route}>{item.title}</Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <section className="card support-doc-cta">
                            <div>
                                <h2>{t('docs.notFoundNeed')}</h2>
                                <p>{t('docs.replyText')}</p>
                            </div>
                            <div className="support-doc-cta-actions">
                                <Link to="/account/help" className="btn btn-primary">
                                    {t('common.contactSupport')}
                                </Link>
                                <Link to="/support" className="btn btn-outline">
                                    {t('common.backToSupport')}
                                </Link>
                            </div>
                        </section>
                    </main>

                    <aside className="support-doc-aside">
                        {/* Обёртка нужна для липкости: сама колонка должна быть высотой со
                            страницу, иначе липкий блок «отклеивается», едва она кончится. */}
                        <div className="support-doc-sticky">
                        <nav className="card support-doc-toc" aria-label={t('docs.onThisPage')}>
                            <h3>{t('docs.onThisPage')}</h3>
                            <ul>
                                {doc.sections.map((section, index) => {
                                    const id = sectionAnchor(index);
                                    const isActive = id === activeId;
                                    return (
                                        <li key={id}>
                                            <a
                                                href={`#${id}`}
                                                className={isActive ? 'is-active' : undefined}
                                                // Не aria-current="page": страница та же, меняется место на ней.
                                                aria-current={isActive ? 'location' : undefined}
                                            >
                                                <span aria-hidden="true">{index + 1}</span>
                                                {section.title}
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </nav>
                        </div>
                    </aside>
                </div>
            </div>

            {/* Слева: справа внизу висит кнопка чата, и вторая круглая кнопка рядом с ней
                читалась бы как её часть. */}
            {showBackToTop && (
                <button
                    type="button"
                    className="support-doc-backtotop"
                    onClick={scrollToTop}
                    aria-label={t('common.backToTop')}
                >
                    <FontAwesomeIcon icon={faArrowUp} />
                </button>
            )}
        </div>
    );
};

export default SupportDocPage;
