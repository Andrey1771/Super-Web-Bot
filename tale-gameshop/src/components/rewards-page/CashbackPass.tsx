import { useTranslation } from "react-i18next";
import { currentLang } from "../../context/site-preferences";
import i18n from "../../i18n";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useKeycloak } from "@react-keycloak/web";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { IUrlService } from "../../iterfaces/i-url-service";
import type { Game } from "../../models/game";
import Cover from "../common/Cover";
import { useSitePreferences, formatMoney } from "../../context/site-preferences";
import { cashbackProgress, percentRange, tierName } from "../../utils/cashback";
import { useCashbackStatus } from "../../hooks/use-cashback-status";
import { useCashbackProgram } from "../../hooks/use-cashback-program";
import { rewardsArt, tierArt } from "./rewardsArt";
import { useReveal } from "./useReveal";
import { useSettled } from "./useSettled";
import "./cashback-pass.css";

/**
 * «Cashback pass» — уровни кэшбэка как трек боевого пропуска.
 *
 * Заменил таблицу уровней и четыре карточки шагов: оба блока были скопированы со страницы
 * DIFMARK почти дословно. Трек поднимается слева направо — «climb the pass» буквально, —
 * пройденная часть светится, текущий уровень крупнее, следующий подписан «сколько осталось».
 *
 * Координаты трека заданы в системе 1000×500 (viewBox), и узлы стоят в тех же долях:
 * SVG растягивается с preserveAspectRatio="none", а толщина линий не плывёт благодаря
 * vector-effect. На узком экране трек превращается в вертикальную лестницу (CSS).
 *
 * Уровни задаёт админка, поэтому число узлов не фиксировано: точки раскладываются по треку сами —
 * равномерно по ширине, с подъёмом, который круче к вершине, как и в исходной четырёхуровневой раскладке.
 */

type Point = { x: number; y: number };

/** Точки уровней на треке, в координатах viewBox 1000×500. */
const trackPoints = (count: number): Point[] => {
    if (count <= 1) {
        return [{ x: 500, y: 300 }];
    }
    return Array.from({ length: count }, (_, index) => {
        const t = index / (count - 1);
        return { x: Math.round(120 + 760 * t), y: Math.round(385 - 265 * Math.pow(t, 1.3)) };
    });
};

/** Отрезки между соседними уровнями — плавные кривые, идущие вверх. */
const trackSegments = (points: Point[]): string[] =>
    points.slice(1).map((to, index) => {
        const from = points[index];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        return `M${from.x} ${from.y} C ${from.x + dx * 0.4} ${from.y + dy * 0.1}, ${to.x - dx * 0.35} ${to.y - dy * 0.25}, ${to.x} ${to.y}`;
    });

const steps = (range: string) => [
    { art: "step-1", title: i18n.t("rewards.pass.step1"), text: i18n.t("rewards.pass.step1Text") },
    { art: "step-3", title: i18n.t("rewards.pass.step2"), text: i18n.t("rewards.pass.step2Text", { range }) },
    { art: "step-4", title: i18n.t("rewards.pass.step3"), text: i18n.t("rewards.pass.step3Text") },
];

const CashbackPass: React.FC = () => {
    const { t } = useTranslation();
    const { currency } = useSitePreferences();
    // Пороги уровней — круглые суммы: «$1,000» читается как веха, «$1,000.00» — как чек.
    const money = (value: number) => {
        const text = formatMoney(value, currency);
        return Number.isInteger(value) ? text.replace(/[.,]00(?=\D*$)/, "") : text;
    };
    const { keycloak } = useKeycloak();
    const status = useCashbackStatus();
    const { tiers } = useCashbackProgram();
    const points = useMemo(() => trackPoints(tiers.length), [tiers.length]);
    const segments = useMemo(() => trackSegments(points), [points]);
    const [ref, shown] = useReveal<HTMLElement>(0.25);
    // Последнее появление (светящийся отрезок и цепочка шагов) заканчивается к ~2.2 с после показа.
    const settled = useSettled(shown, 2600);
    const [covers, setCovers] = useState<Game[]>([]);
    const partialRef = useRef<SVGPathElement | null>(null);
    const [marker, setMarker] = useState<{ x: number; y: number } | null>(null);

    const services = useMemo(
        () => ({
            apiClient: container.get<IApiClient>(IDENTIFIERS.IApiClient),
            urlService: container.get<IUrlService>(IDENTIFIERS.IUrlService),
        }),
        []
    );

    // Размытые обложки по краям сцены — атмосфера «это магазин игр». Не пришли — сцена без них.
    useEffect(() => {
        let active = true;
        services.apiClient.api
            .get(`/api/game/catalog?sort=popular&pageSize=3&currency=${encodeURIComponent(currency)}`)
            .then((response) => {
                if (active) {
                    setCovers((response.data?.items ?? []) as Game[]);
                }
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [currency, services]);

    const spent = status.signedIn ? status.totalSpent : 0;
    const { tier, next, remaining, ratio } = cashbackProgress(spent, tiers);
    const current = Math.max(0, tiers.findIndex((item) => item.id === tier.id));
    const partial = next ? ratio : 0;

    // Точка на конце светящейся части — там, где покупатель сейчас между уровнями. В jsdom
    // у path нет геометрии, поэтому без неё просто нет точки.
    useLayoutEffect(() => {
        const path = partialRef.current;
        if (!path || partial <= 0.02 || partial >= 0.98 || typeof path.getTotalLength !== "function") {
            setMarker(null);
            return;
        }
        try {
            const point = path.getPointAtLength(path.getTotalLength() * partial);
            setMarker({ x: point.x, y: point.y });
        } catch {
            setMarker(null);
        }
    }, [partial, current, segments]);

    // Подпись метки на пути. На верхнем уровне сумму трат не показываем: идти дальше некуда, и число
    // перестаёт быть прогрессом — остаётся отчёт о том, сколько человек оставил в магазине.
    const tag = !status.signedIn ? t("rewards.pass.startHere") : next && spent > 0 ? t("rewards.pass.you", { amount: money(spent) }) : t("rewards.pass.youAreHere");

    const nodeState = (index: number) =>
        index < current ? "is-done" : index === current ? "is-current" : index === current + 1 ? "is-next" : "is-locked";

    const nodeNote = (index: number) => {
        const item = tiers[index];
        if (index === current && status.signedIn) {
            return t("rewards.pass.yourLevel");
        }
        if (index === current + 1 && status.signedIn && remaining !== null) {
            return t("rewards.pass.toGo", { amount: money(remaining) });
        }
        return item.spendThreshold === null
            ? t("rewards.pass.fromFirstOrder")
            : t("rewards.pass.spent", { amount: money(item.spendThreshold) });
    };

    const cta = !status.signedIn
        ? { title: t("rewards.pass.ctaFirst"), text: t("rewards.pass.ctaFirstText") }
        : next
            ? { title: t("rewards.pass.ctaNext"), text: t("rewards.pass.ctaNextText", { name: tierName(next) }) }
            : { title: t("rewards.pass.ctaNext"), text: t("rewards.pass.ctaTopText", { percent: tier.percent }) };

    return (
        <section className={`cpass${shown ? " is-in" : ""}${settled ? " is-settled" : ""}`} ref={ref} aria-labelledby="cpass-title">
            <div className="cpass-sky" aria-hidden="true" />
            <i className="fx-texture cpass-texture" aria-hidden="true" />
            <div className="cpass-floor" aria-hidden="true"><div /></div>
            <div className="cpass-horizon" aria-hidden="true" />
            {covers.slice(0, 3).map((game, index) => (
                <Cover key={game.id ?? index} className={`cpass-cover cpass-cover-${index + 1}`} ratio="portrait" sizes="150px" src={game.imagePath} title={game.title ?? game.name} baseUrl={services.urlService.apiBaseUrl} imgProps={{ 'aria-hidden': true }} />
            ))}

            <div className="container cpass-inner">
                <div className="cpass-head">
                    <div>
                        <span className="cpass-eyebrow">{t("rewards.pass.eyebrow")}</span>
                        <h2 id="cpass-title">
                            {t("rewards.pass.title1")}<br />
                            <span>{t("rewards.pass.title2")}</span><br />
                            {t("rewards.pass.title3")}
                        </h2>
                        <p>{t("rewards.pass.text")}</p>
                    </div>

                    {status.ready && (
                        <div className="cpass-balance">
                            {status.signedIn ? (
                                <>
                                    <small>{t("rewards.pass.balance")}</small>
                                    <b>{formatMoney(status.available, currency)}</b>
                                    <Link to="/account/rewards">{t("rewards.pass.openHistory")}</Link>
                                </>
                            ) : (
                                <>
                                    <small>{t("rewards.pass.trackClimb")}</small>
                                    <button type="button" onClick={() => keycloak.login({ redirectUri: window.location.href, locale: currentLang() })}>
                                        {t("common.signIn")}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="cpass-track">
                    <svg className="cpass-rail" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
                        {segments.map((d) => (
                            <path key={`base-${d}`} d={d} className="cpass-rail-base" vectorEffect="non-scaling-stroke" />
                        ))}
                        {segments.map((d) => (
                            <path key={`dots-${d}`} d={d} className="cpass-rail-dots" vectorEffect="non-scaling-stroke" />
                        ))}
                        <g className="cpass-rail-glow">
                            {segments.map((d, index) => {
                                const fill = index < current ? 1 : index === current ? partial : 0;
                                if (fill <= 0) {
                                    return null;
                                }
                                return (
                                    <path
                                        key={`fill-${d}`}
                                        ref={index === current ? partialRef : undefined}
                                        d={d}
                                        pathLength={1}
                                        className="cpass-rail-fill"
                                        style={{ strokeDasharray: `${fill} 1`, "--i": index } as React.CSSProperties}
                                        vectorEffect="non-scaling-stroke"
                                    />
                                );
                            })}
                        </g>
                    </svg>

                    {marker && (
                        <span
                            className="cpass-dot"
                            style={{ left: `${marker.x / 10}%`, top: `${marker.y / 5}%` }}
                            aria-hidden="true"
                        />
                    )}

                    <ol className={`cpass-nodes${tiers.length > 5 ? " is-dense" : ""}`}>
                        {tiers.map((item, index) => (
                            <li
                                key={item.id}
                                className={`cpass-node ${nodeState(index)}`}
                                style={
                                    {
                                        left: `${points[index].x / 10}%`,
                                        top: `${points[index].y / 5}%`,
                                        "--i": index,
                                    } as React.CSSProperties
                                }
                            >
                                <span className="cpass-plat" aria-hidden="true" />
                                <span className="cpass-medal">
                                    {index === current && <span className="cpass-tag">{tag}</span>}
                                    <img src={tierArt(item, services.urlService.apiBaseUrl)} alt="" />
                                </span>
                                <span className="cpass-label">
                                    <b>{tierName(item)}</b>
                                    <span className="cpass-pct">{item.percent}%</span>
                                    <small>{nodeNote(index)}</small>
                                </span>
                            </li>
                        ))}
                    </ol>

                    <div className="cpass-next">
                        {next ? (
                            <>
                                <small>{t("rewards.pass.nextStop")}</small>
                                <b>{t("rewards.pass.back", { name: tierName(next), percent: next.percent })}</b>
                                <div className="cpass-bar" aria-hidden="true">
                                    <i style={{ width: `${Math.round(partial * 100)}%` }} />
                                </div>
                                <p>
                                    {status.signedIn && remaining !== null
                                        ? t("rewards.pass.progress", { remaining: money(remaining), spent: money(spent), threshold: money(next.spendThreshold ?? 0) })
                                        : t("rewards.pass.unlocksAfter", { amount: money(next.spendThreshold ?? 0) })}
                                </p>
                            </>
                        ) : (
                            <>
                                <small>{t("rewards.pass.top")}</small>
                                <b>{t("rewards.pass.back", { name: tierName(tier), percent: tier.percent })}</b>
                                <p>{t("rewards.pass.topText")}</p>
                            </>
                        )}
                    </div>
                </div>

                <div className="cpass-steps">
                    {steps(percentRange(tiers).text).map((step, index) => (
                        <React.Fragment key={step.title}>
                            {index > 0 && <span className="cpass-arrow" aria-hidden="true">→</span>}
                            <div className="cpass-chip" style={{ "--i": index } as React.CSSProperties}>
                                <img src={rewardsArt(step.art)} alt="" />
                                <span>
                                    <b>{step.title}</b>
                                    <small>{step.text}</small>
                                </span>
                            </div>
                        </React.Fragment>
                    ))}
                    <span className="cpass-arrow is-lead" aria-hidden="true">→</span>
                    <Link to="/games" className="cpass-cta">
                        {/* Ракета из того же набора 3D-иконок, что и шаги: линейная SVG рядом
                            с объёмными картинками выглядела чужой. */}
                        <span className="cpass-cta-icon" aria-hidden="true">
                            <img src={rewardsArt("cta-rocket")} alt="" />
                        </span>
                        <span className="cpass-cta-text">
                            <b>{cta.title}</b>
                            <small>{cta.text}</small>
                        </span>
                        <span className="cpass-cta-go" aria-hidden="true">→</span>
                    </Link>
                </div>
            </div>
        </section>
    );
};

export default CashbackPass;
