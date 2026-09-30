import { useTranslation } from "react-i18next";
import React, { useEffect, useMemo, useState } from "react";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { IUrlService } from "../../iterfaces/i-url-service";
import type { Game } from "../../models/game";
import Cover from "../common/Cover";
import { useSitePreferences, formatMoney } from "../../context/site-preferences";
import { cashbackForOrder, tierName } from "../../utils/cashback";
import { useCashbackProgram } from "../../hooks/use-cashback-program";
import { RewardsReceiptArt } from "./RewardsArtwork";
import { rewardsArt } from "./rewardsArt";

/**
 * Заказ, с которого возвращается кэшбэк, — живой, из каталога.
 *
 * Раньше здесь стоял нарисованный чек из серых полосок: он объяснял идею, но выглядел
 * иллюстрацией. Настоящая игра с обложкой и ценой в валюте покупателя читается как
 * магазин, а не как схема, и цифра кэшбэка в ней посчитана тем же cashbackForOrder,
 * что и считалка ниже.
 *
 * Берём самую дорогую игру со скидкой: на ней видно главное правило — процент считается
 * с суммы ПОСЛЕ скидки, — а сумма кэшбэка не выходит копеечной (самая большая скидка
 * попадала на игру за пару долларов и возвращала «+$0.07»). Скидок нет — любую популярную игру. Каталог не ответил —
 * нарисованный чек, блок не остаётся пустым.
 */

const CashbackOrderCard: React.FC = () => {
    const { t } = useTranslation();
    const { tiers } = useCashbackProgram();
    const { currency } = useSitePreferences();
    const [game, setGame] = useState<Game | null>(null);
    const [failed, setFailed] = useState(false);

    const services = useMemo(
        () => ({
            apiClient: container.get<IApiClient>(IDENTIFIERS.IApiClient),
            urlService: container.get<IUrlService>(IDENTIFIERS.IUrlService),
        }),
        []
    );

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const api = services.apiClient.api;
                const query = `pageSize=1&currency=${encodeURIComponent(currency)}`;
                const sale = await api.get(`/api/game/catalog?onSale=true&sort=price-desc&${query}`);
                let pick = (sale.data?.items?.[0] ?? null) as Game | null;
                if (!pick) {
                    const popular = await api.get(`/api/game/catalog?sort=popular&${query}`);
                    pick = (popular.data?.items?.[0] ?? null) as Game | null;
                }
                if (active) {
                    setGame(pick);
                    setFailed(!pick);
                }
            } catch {
                if (active) {
                    setFailed(true);
                }
            }
        })();
        return () => {
            active = false;
        };
    }, [currency, services]);

    if (failed) {
        return <RewardsReceiptArt />;
    }

    if (!game) {
        return <div className="rw-order rw-order--loading" aria-hidden="true" />;
    }

    // Пример — уровень ближе к вершине (предпоследний), а не стартовый: на стартовом проценте сумма выходит
    // копеечной и не показывает, ради чего копить уровень. Подпись честно называет уровень, так что это не
    // обещание каждому, а иллюстрация.
    const tier = tiers[Math.max(0, tiers.length - 2)];
    const price = Number(game.price ?? 0);
    const paid = Number(game.finalPrice ?? game.price ?? 0);
    const discount = Math.max(0, price - paid);
    const back = cashbackForOrder(paid, tier);
    const platform = game.platforms?.[0] ?? "PC";

    return (
        // Наклон — у figure, отрисовка карточки — во внутреннем блоке. Почему анимации здесь
        // с fill-mode backwards — см. .rw-order в rewards-page.css (иначе текст мылится).
        <figure className="rw-order" aria-label={t("rewards.exampleOrder")}>
          <div className="rw-order-card">
            <div className="rw-order-head rw-r-step" style={{ "--d": "0.2s" } as React.CSSProperties}>
                <Cover className="rw-order-cover" ratio="portrait" sizes="64px" widths={[240]} src={game.imagePath} title={game.title ?? game.name} baseUrl={services.urlService.apiBaseUrl} />
                <div className="rw-order-title">
                    <strong>{game.title ?? game.name}</strong>
                    <span>{platform} · {t("rewards.digitalKey")}</span>
                </div>
            </div>

            <dl className="rw-order-rows">
                <div className="rw-r-step" style={{ "--d": "0.45s" } as React.CSSProperties}>
                    <dt>{t("rewards.price")}</dt>
                    <dd className={discount > 0 ? "is-struck" : undefined}>{formatMoney(price, currency)}</dd>
                </div>
                {discount > 0 && (
                    <div className="rw-r-step" style={{ "--d": "0.6s" } as React.CSSProperties}>
                        <dt>{t("rewards.discount")} {game.discountPercent ? `−${game.discountPercent}%` : ""}</dt>
                        <dd className="is-discount">−{formatMoney(discount, currency)}</dd>
                    </div>
                )}
                <div className="rw-order-total rw-r-step" style={{ "--d": "0.75s" } as React.CSSProperties}>
                    <dt>{t("rewards.youPay")}</dt>
                    <dd>{formatMoney(paid, currency)}</dd>
                </div>
            </dl>

            {/* Финал: отдельная строка, не вычитаемая из счёта, — то, что вернётся. */}
            <div className="rw-order-cash">
                <span className="rw-order-coin rw-r-coin" aria-hidden="true" />
                <div>
                    <strong>{t("rewards.comesBack")}</strong>
                    <span className="rw-order-tier">
                        {t("rewards.backAt", { percent: tier.percent })}
                        <img src={rewardsArt(`tier-${tier.id}`)} alt="" aria-hidden="true" />
                        {t("rewards.level", { name: tierName(tier) })}
                    </span>
                </div>
                <b className="rw-order-amount">+{formatMoney(back, currency)}</b>
            </div>
          </div>
        </figure>
    );
};

export default CashbackOrderCard;
