import PageMeta from "../common/PageMeta";
import { useTranslation } from "react-i18next";
import React, {useEffect, useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faBolt,
    faCircleCheck,
    faClock,
    faHeadset,
    faLayerGroup,
    faLifeRing,
    faRotateLeft,
    faShieldHalved,
    faStar
} from "@fortawesome/free-solid-svg-icons";
import {Link} from "react-router-dom";
import {getSiteReviewSummary, EMPTY_SITE_REVIEW_SUMMARY} from "../../api/reviewsApi";
import type {SiteReviewSummary} from "../../api/reviewsApi";
import {buildSiteRatingView, formatAverage, formatReviewCount, MIN_REVIEWS_FOR_RATING} from "../../utils/site-rating";
import {getAboutStats, getAboutTeam} from "../../api/reviewsApi";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type {IUrlService} from "../../iterfaces/i-url-service";
import {resolveMediaUrl} from "../../utils/media";
import type {AboutTeamMember} from "../../api/reviewsApi";
import {buildResponseTime, buildStatTiles, EMPTY_ABOUT_STATS} from "../../utils/about-stats";
import type {AboutStats} from "../../utils/about-stats";
import ReviewsCarousel from "./ReviewsCarousel";
import PurposeArtwork from "./PurposeArtwork";
import "./about-us.css";

// Тексты — в словаре about.pills.<key>.
const featurePills = [
    {
        key: "secure",
        title: "Secure checkout",
        description: "Encrypted payments to protect every transaction.",
        icon: faShieldHalved
    },
    {
        key: "instant",
        title: "Instant delivery",
        description: "Digital keys sent right after purchase.",
        icon: faBolt
    },
    {
        key: "curated",
        title: "Curated picks",
        description: "Top titles selected by passionate gamers.",
        icon: faLayerGroup
    },
    {
        key: "support",
        title: "Support 24/7",
        description: "Real people ready to help around the clock.",
        icon: faHeadset
    }
];

// Ключи словаря about.highlights.*.
const ratingHighlights = ["support", "prices", "delivery"];

// Принципы, а не перечень фич: каждый ведёт на реальное доказательство (каталог, документ, безопасность).
const principles = [
    {
        key: "curation",
        title: "Player-first curation",
        description: "We stock games worth your time — handpicked by people who play, not dumped in bulk.",
        icon: faLayerGroup,
        link: { to: "/games", label: "Browse the catalog" }
    },
    {
        key: "security",
        title: "Security you can see",
        description: "Two-factor auth, backup codes, and an account-recovery process we publish in full.",
        icon: faShieldHalved,
        link: { to: "/support/docs/account-recovery", label: "How recovery works" }
    },
    {
        key: "fair",
        title: "Fair and upfront",
        description: "Refund rules and region details are shown before you buy — never sprung on you after.",
        icon: faRotateLeft,
        link: { to: "/support/docs/refund-policy", label: "Refund policy" }
    },
    {
        key: "support",
        title: "Support by real players",
        description: "Gamers answering chat and email in minutes, with no scripted runaround.",
        icon: faHeadset,
        link: { to: "/support", label: "Visit support" }
    }
];

/**
 * История магазина по годам.
 *
 * Пусто намеренно. Здесь стояли пять придуманных вех — «2020 Tale Shop opens», «2021 Global
 * catalog», «2024 ... sub-5 minute replies» — то есть биография магазина, которого в 2020 году
 * не существовало. Ни одну из этих дат посчитать неоткуда: когда что было, знает только
 * владелец, и написать их может только он.
 *
 * Пока список пуст, раздел не рисуется целиком. Чтобы вернуть его, достаточно вписать сюда
 * настоящие вехи — разметка ниже осталась на месте.
 */
const journey: { year: string; title: string; description: string }[] = [];

// Ссылки живые: центр поддержки и реальные документы (включая восстановление доступа).
const supportCards = [
    {
        key: "help",
        title: "Support that actually helps",
        description: "Real people with gaming expertise, ready to resolve any issue.",
        icon: faHeadset,
        items: [
            { label: "Open the support center", to: "/support" },
            { label: "Account recovery & 2FA", to: "/support/docs/account-recovery" }
        ]
    },
    {
        key: "policies",
        title: "Policies & safety",
        description: "Clear guidelines to keep your purchases safe and transparent.",
        icon: faLifeRing,
        items: [
            { label: "Refund policy", to: "/support/docs/refund-policy" },
            { label: "Regional restrictions", to: "/support/docs/regional-restrictions" }
        ]
    }
];

/**
 * Оттенок кружка с буквой. Считается из имени, поэтому у человека он всегда один и тот же
 * и не прыгает при перестановке карточек. 37 — простое число: соседние имена расходятся по
 * кругу далеко, а не сливаются в один цвет.
 */
const avatarHue = (name: string): number => {
    let hash = 0;
    for (const char of name.trim()) {
        hash = (hash * 37 + (char.codePointAt(0) ?? 0)) % 360;
    }
    return hash;
};

export default function AboutUs() {
    const { t } = useTranslation();
    // Рейтинг приходит с сервера и считается по опубликованным отзывам, а не задан в коде.
    // null — ответа ещё нет; в этот момент рисуем заглушку, а не ноль: «0 из 5» на секунду
    // хуже, чем пустое место.
    const [summary, setSummary] = useState<SiteReviewSummary | null>(null);

    useEffect(() => {
        let cancelled = false;
        getSiteReviewSummary()
            // Витрина не должна падать из-за сводки отзывов: не ответила — считаем, что
            // отзывов нет, и показываем то же, что показали бы новому магазину.
            .catch(() => EMPTY_SITE_REVIEW_SUMMARY)
            .then((data) => {
                if (!cancelled) {
                    setSummary(data);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Цифры масштаба считает сервер. Пока ответа нет — плиток нет: показать «0 games»
    // на секунду хуже, чем не показать ничего.
    const [stats, setStats] = useState<AboutStats>(EMPTY_ABOUT_STATS);

    useEffect(() => {
        let cancelled = false;
        getAboutStats()
            // Страница про магазин важнее счётчиков на ней: не ответили — просто нет плиток.
            .catch(() => EMPTY_ABOUT_STATS)
            .then((data) => {
                if (!cancelled) {
                    setStats(data);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Команда приходит с сервера и задаётся в админке. Пустой список — раздела нет.
    // Здесь раньше лежали четверо выдуманных сотрудников с именами и должностями; это
    // утверждение о конкретных людях, и заготовке «по умолчанию» тут места нет.
    const [team, setTeam] = useState<AboutTeamMember[]>([]);
    // Фотографии лежат в медиатеке и приходят путём от корня. В докере их отдаёт тот же
    // хост, но в дев-сборке фронт живёт на другом порту — адрес надо достроить, как это
    // делают обложки игр.
    const apiBaseUrl = container.get<IUrlService>(IDENTIFIERS.IUrlService).apiBaseUrl;

    useEffect(() => {
        let cancelled = false;
        getAboutTeam()
            .catch(() => [] as AboutTeamMember[])
            .then((data) => {
                if (!cancelled) {
                    setTeam(data);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const rating = summary ? buildSiteRatingView(summary) : null;
    const quotes = summary?.quotes ?? [];
    const statTiles = buildStatTiles(stats);
    const responseTime = buildResponseTime(stats);

    return (
        <div className="about-hero-wrapper" id="about-top">
            <PageMeta title={t("about.title")} canonicalPath="/about" />
            <div className="container py-14 lg:py-20">
                <div className="grid lg:grid-cols-2 gap-12 xl:gap-16 lg:items-center">
                    <div className="space-y-8">
                        <div className="space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-600">{t("about.eyebrow")}</p>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight">{t("about.title")}</h1>
                            <p className="text-lg text-slate-600 max-w-2xl">{t("about.lead")}</p>
                        </div>

                        <div className="flex flex-wrap gap-4">
                            <Link to="/games" className="btn btn-primary px-6 about-btn-primary">{t("about.goToStore")}</Link>
                            <Link to="/support" className="btn btn-outline px-6 about-btn-outline">{t("about.contactSupport")}</Link>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-4">
                            {featurePills.map((feature) => (
                                <div key={feature.title} className="about-pill">
                                    <span className="about-pill-icon">
                                        <FontAwesomeIcon icon={feature.icon}/>
                                    </span>
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-slate-900">{t("about.pills." + feature.key + ".title")}</p>
                                        <p className="text-sm text-slate-600 leading-relaxed">{t("about.pills." + feature.key + ".text")}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="about-rating-card">
                        {/* Заголовок про игроков, а не про магазин: считается это по отзывам на
                            игры, которые оставили покупатели. Назвать то же число «рейтингом
                            магазина» было бы подменой — низкая оценка игре ничего не говорит о
                            том, как отработал магазин. Оценка магазина — отдельная история и
                            собирается опросом после доставки. */}
                        <div className="about-rating-head flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold text-slate-500 uppercase tracking-[0.12em]">{t("about.playerRatings")}</p>

                                {rating === null && (
                                    <div className="about-score-loading" aria-hidden="true">
                                        <span className="about-score-loading-value"/>
                                        <span className="about-score-loading-line"/>
                                    </div>
                                )}

                                {rating?.state === "ready" && (
                                    <>
                                        <p className="text-5xl font-extrabold text-slate-900 about-score-value">
                                            {formatAverage(rating.average)}<span className="text-2xl text-slate-500">/5</span>
                                        </p>
                                        <div
                                            className="about-stars"
                                            role="img"
                                            aria-label={t("about.ratedAria", { value: formatAverage(rating.average) })}
                                        >
                                            <div className="about-stars-bg" aria-hidden="true">
                                                {Array.from({length: 5}).map((_, index) => (
                                                    <FontAwesomeIcon key={index} icon={faStar}/>
                                                ))}
                                            </div>
                                            <div className="about-stars-fill" style={{width: `${rating.starsPercent}%`}} aria-hidden="true">
                                                {Array.from({length: 5}).map((_, index) => (
                                                    <FontAwesomeIcon key={index} icon={faStar}/>
                                                ))}
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-500">
                                            {t("about.basedOn", { count: t("common.reviewsCount", { count: rating.count }) })}
                                        </p>
                                    </>
                                )}

                                {rating?.state === "too-few" && (
                                    <>
                                        <p className="text-3xl font-extrabold text-slate-900 about-score-value">{t("about.notEnough")}</p>
                                        <p className="text-sm text-slate-500">
                                            {t("about.notEnoughText", { count: formatReviewCount(rating.count), min: MIN_REVIEWS_FOR_RATING })}
                                        </p>
                                    </>
                                )}

                                {rating?.state === "empty" && (
                                    <>
                                        <p className="text-3xl font-extrabold text-slate-900 about-score-value">{t("about.noReviews")}</p>
                                        <p className="text-sm text-slate-500">
                                            {t("about.beFirstBefore")}<Link className="about-inline-link" to="/games">{t("about.pickUpGame")}</Link>{t("about.beFirstAfter")}
                                        </p>
                                    </>
                                )}
                            </div>
                            {/* Раньше здесь стояло «Real customers. Real feedback.» — заявление о
                                проверке. Теперь написано само правило, которое сервер и применяет:
                                отзыв принимается только при оплаченном заказе на эту игру
                                (GameReviewsController.CreateReview). Это можно проверить, а не
                                просто пообещать. */}
                            <div className="about-score-badge">
                                <FontAwesomeIcon icon={faCircleCheck} className="text-purple-600"/>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 leading-tight">{t("about.buyersOnly")}</p>
                                    <p className="text-xs text-slate-500">{t("about.buyersOnlyText")}</p>
                                </div>
                            </div>
                        </div>

                        {rating?.state === "ready" && (
                            <div className="about-rating-breakdown" aria-label={t("about.distribution")}>
                                {rating.rows.map((row) => (
                                    <div key={row.stars} className="about-breakdown-row">
                                        <span className="about-breakdown-stars">{row.stars}★</span>
                                        <div className="about-breakdown-bar">
                                            {/* Ширина по неокруглённой доле, подпись — по округлённой:
                                                иначе полоса и число расходятся на мелких значениях. */}
                                            <span style={{width: `${row.exactPercent}%`}}/>
                                        </div>
                                        <span className="about-breakdown-value">{row.percent}%</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="about-verification-banner">
                            <span className="about-banner-icon">
                                <FontAwesomeIcon icon={faShieldHalved}/>
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">{t("about.guarantee")}</p>
                                <p className="text-sm text-slate-600">{t("about.guaranteeText")}</p>
                            </div>
                        </div>

                        <ul className="space-y-2">
                            {ratingHighlights.map((item) => (
                                <li key={item} className="flex items-start gap-3 text-sm text-slate-700">
                                    <span className="about-list-icon">
                                        <FontAwesomeIcon icon={faCircleCheck}/>
                                    </span>
                                    <span className="leading-relaxed">{t("about.highlights." + item)}</span>
                                </li>
                            ))}
                        </ul>

                        {/* «Under 5 minutes» стояло тут константой. Теперь это медиана времени до
                            первого ответа живого человека по обращениям в поддержку; пока обращений
                            мало, строки просто нет — обещать скорость по трём тикетам нельзя.
                            Вторая ячейка не число, а описание способа доставки, и оно верно всегда:
                            прежнее «Global digital delivery» звучало как охват, которого мы не мерили. */}
                        <div className="about-meta-row">
                            {responseTime && (
                                <div>
                                    <p className="text-xs text-slate-500 uppercase tracking-[0.12em]">{t("about.medianReply")}</p>
                                    <p className="text-base font-semibold text-slate-900 flex items-center gap-2"><FontAwesomeIcon icon={faClock} className="text-purple-600"/>{responseTime}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-[0.12em]">{t("about.delivery")}</p>
                                <p className="text-base font-semibold text-slate-900">{t("about.keysByEmail")}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Свежие отзывы — под сеткой, а не внутри карточки рейтинга.
                    Внутри они разносили её до 803px при 519px у левой колонки: карточка
                    вылезала на 142px сверху и снизу, и первый экран разъезжался. Здесь им
                    хватает ширины на две колонки, карточка вернулась к прежнему росту, а
                    связь с оценкой не потерялась — они стоят сразу под ней.
                    Смысл прежний: число, которое никуда не ведёт, проверить нельзя. */}
                {quotes.length > 0 && (
                    <section className="about-section about-voices" aria-label={t("about.recentReviews")}>
                        {/* Заголовок такой же, как у остальных разделов страницы (метка + крупный
                            заголовок + подпись). Раньше тут стояла одинокая серая строчка, и блок
                            читался как черновик, приклеенный снизу, а не как часть страницы. */}
                        <div className="about-section-header">
                            <span className="about-label">{t("about.recentReviews")}</span>
                            <h2 className="about-section-title">{t("about.recentTitle")}</h2>
                            <p className="about-section-subtitle">{t("about.recentText")}</p>
                        </div>
                        <ReviewsCarousel quotes={quotes}/>
                    </section>
                )}

                {/* Тёмный центр страницы: цель бренда + mission/vision + цифры масштаба одним акцентом. */}
                {/* Одна раскладка на любое число цифр: текст во всю ширину, цифры строкой под
                    ним, рисунок фоном справа. Раньше панель переключалась между одной и двумя
                    колонками по числу плиток — и при переключении рисунок то появлялся, то
                    пропадал, а с ним и половина смысла панели. */}
                <section className="about-purpose">
                    <PurposeArtwork/>

                    <div className="about-purpose-copy">
                        <span className="about-purpose-eyebrow">{t("about.purpose")}</span>
                        <h2 className="about-purpose-title">{t("about.purposeTitle")}</h2>
                        <p className="about-purpose-lead">{t("about.purposeLead")}</p>
                        {/* Три блока вместо двух, и каждый — в два-три предложения.
                            Раньше здесь стояли две строки по десятку слов: в высокой панели они
                            висели полосой и не давали ей содержания. Формулировки описывают то,
                            что в магазине действительно сделано (регион показан до оплаты, правила
                            возврата опубликованы, восстановление доступа расписано), а не
                            намерения, которые нечем подтвердить. */}
                        <div className="about-purpose-points">
                            <div className="about-purpose-point">
                                <span className="about-purpose-point-label">{t("about.mission")}</span>
                                <p>{t("about.missionText")}</p>
                            </div>
                            <div className="about-purpose-point">
                                <span className="about-purpose-point-label">{t("about.vision")}</span>
                                <p>{t("about.visionText")}</p>
                            </div>
                            <div className="about-purpose-point">
                                <span className="about-purpose-point-label">{t("about.promise")}</span>
                                <p>{t("about.promiseText")}</p>
                            </div>
                        </div>
                    </div>
                    {/* Плитки рисуются только по тем цифрам, которые сервер посчитал и которые
                        доросли до порога (см. utils/about-stats). У молодого магазина их может не
                        быть вовсе — тогда блока нет, и это честнее выдуманных «5,000+». */}
                    {statTiles.length > 0 && (
                        <div className="about-purpose-stats">
                            {statTiles.map((stat) => (
                                <div key={stat.label} className="about-purpose-stat">
                                    <span className="about-purpose-stat-value">{stat.value}</span>
                                    <span className="about-purpose-stat-label">{stat.label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <div className="about-section">
                    <div className="about-section-header">
                        <span className="about-label">{t("about.standFor")}</span>
                        <h2 className="about-section-title">{t("about.principlesTitle")}</h2>
                        <p className="about-section-subtitle">{t("about.principlesText")}</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 lg:gap-6">
                        {principles.map((item) => (
                            <div key={item.title} className="about-principle-card">
                                <div className="about-principle-icon">
                                    <FontAwesomeIcon icon={item.icon}/>
                                </div>
                                <div className="about-principle-body">
                                    <p className="about-principle-title">{t("about.principles." + item.key + ".title")}</p>
                                    <p className="about-principle-text">{t("about.principles." + item.key + ".text")}</p>
                                    <Link className="about-link" to={item.link.to}>{t("about.principles." + item.key + ".link")} →</Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {journey.length > 0 && (
                <div className="about-section">
                    <div className="about-section-header">
                        <span className="about-label">{t("about.journey")}</span>
                        <h2 className="about-section-title">{t("about.journeyTitle")}</h2>
                        <p className="about-section-subtitle">{t("about.journeyText")}</p>
                    </div>

                    <div className="about-timeline">
                        {journey.map((step, index) => (
                            <div key={step.year} className="about-timeline-row">
                                <div className="about-timeline-year">{step.year}</div>
                                <div className="about-timeline-line">
                                    <span className="about-timeline-dot" aria-hidden="true"/>
                                    {index !== journey.length - 1 && <span className="about-timeline-connector" aria-hidden="true"/>}
                                </div>
                                <div className="about-timeline-body">
                                    <h4 className="text-base font-semibold text-slate-900">{step.title}</h4>
                                    <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                )}

                {team.length > 0 && (
                <div className="about-section">
                    <div className="about-section-header">
                        <span className="about-label">{t("about.team")}</span>
                        <h2 className="about-section-title">{t("about.teamTitle")}</h2>
                        <p className="about-section-subtitle">{t("about.teamText")}</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-5 lg:gap-6">
                        {team.map((member) => (
                            <div key={member.name} className="about-team-card">
                                <div className="space-y-2">
                                    {member.badge && <span className="about-team-badge">{member.badge}</span>}
                                    <h3 className="text-xl font-bold text-slate-900">{member.name}</h3>
                                    {member.role && <p className="text-sm font-semibold text-purple-700">{member.role}</p>}
                                    {member.description && (
                                        <p className="text-sm text-slate-600 leading-relaxed">{member.description}</p>
                                    )}
                                </div>
                                {/* Фотография, если её поставили в админке. Без неё — кружок с первой
                                    буквой имени: отдельного поля под букву нет, иначе она разъедется
                                    с именем при первой же правке. Оттенок кружка считается из имени,
                                    чтобы люди в списке отличались друг от друга, а не выглядели
                                    четырьмя одинаковыми пятнами. */}
                                <div
                                    className="about-team-avatar"
                                    style={{ ["--avatar-hue" as string]: avatarHue(member.name) }}
                                    aria-hidden="true"
                                >
                                    {member.photoUrl ? (
                                        <img src={resolveMediaUrl(member.photoUrl, apiBaseUrl)} alt="" loading="lazy" />
                                    ) : (
                                        member.name.trim().charAt(0).toUpperCase()
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                )}

                <div className="about-section">
                    <div className="about-section-header">
                        <span className="about-label">{t("about.supportSection")}</span>
                        <h2 className="about-section-title">{t("about.supportTitle")}</h2>
                        <p className="about-section-subtitle">{t("about.supportText")}</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-5 lg:gap-6">
                        {supportCards.map((card) => (
                            <div key={card.title} className="about-support-card">
                                <div className="about-support-icon">
                                    <FontAwesomeIcon icon={card.icon}/>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold text-slate-900">{t("about.cards." + card.key + ".title")}</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">{t("about.cards." + card.key + ".text")}</p>
                                    <ul className="space-y-2">
                                        {card.items.map((item, itemIndex) => (
                                            <li key={item.label} className="about-support-item">
                                                <span className="about-support-dot">
                                                    <FontAwesomeIcon icon={faCircleCheck}/>
                                                </span>
                                                <Link className="about-link" to={item.to}>{t("about.cards." + card.key + ".link" + (itemIndex + 1))}</Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="about-final-section">
                    <div className="about-final-cta">
                        <div className="about-final-content">
                            <div className="space-y-3">
                                <h2 className="about-final-title">{t("about.finalTitle")}</h2>
                                <p className="about-final-subtitle">{t("about.finalText")}</p>
                                <p className="about-final-meta">{t("about.finalMeta")}</p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <Link to="/games" className="btn btn-primary about-final-button">{t("about.goToStore")}</Link>
                                <Link to="/deals" className="btn btn-outline about-final-button">{t("about.seeDeals")}</Link>
                            </div>
                        </div>
                    </div>

                    <div className="about-final-row">
                        <a className="about-back-top" href="#about-top">{t("about.backToTop")}</a>
                    </div>
                </div>
            </div>
        </div>
    );
}
