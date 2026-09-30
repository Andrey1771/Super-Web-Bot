import React, { useEffect, useMemo, useState } from "react";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { IUrlService } from "../../iterfaces/i-url-service";
import type { Game } from "../../models/game";
import Cover from "../common/Cover";
import { useSitePreferences, formatMoney } from "../../context/site-preferences";
import { cashbackForOrder } from "../../utils/cashback";
import { useCashbackProgram } from "../../hooks/use-cashback-program";
import { RewardsHeroArt } from "./RewardsArtwork";
import { rewardsArt } from "./rewardsArt";
import { useSettled } from "./useSettled";

/**
 * Сцена в шапке страницы кэшбэка: игры → кошелёк → то, что вернулось.
 *
 * Сзади веером три настоящие обложки популярных игр из каталога, спереди кошелёк, вокруг
 * зелёные звёзды и бейдж с суммой кэшбэка за верхнюю игру. Раньше тут был абстрактный
 * ключ — вне контекста он не читался как «ключ от игры», а обложка читается сразу.
 *
 * Кошелёк и звёзды — 3D-рендеры 3dicons (CC0), перекрашенные в палитру сайта
 * (см. public/images/rewards/README.md). Сцена показывается, только когда есть и
 * картинки, и игры; иначе — векторный запасной рисунок.
 */

const LAYERS = {
    wallet: rewardsArt("hero-wallet"),
    star: rewardsArt("hero-star"),
};

/** Откуда разлетаются звёзды — центр кошелька, в долях сцены. */
const ORIGIN = { left: 70, top: 62 };

const FLYING = [
    { left: 2, top: 74, size: 10, i: 0 },
    { left: 88, top: 18, size: 9, i: 1 },
    { left: 92, top: 78, size: 7, i: 2 },
    { left: 44, top: 88, size: 6, i: 3 },
];

/** Веер обложек: положение и наклон каждой карточки. Последняя лежит сверху. */
const FAN = [
    { left: 4, top: 16, rotate: -14 },
    { left: 36, top: 6, rotate: 9 },
    { left: 19, top: 2, rotate: -3 },
];

const loads = (src: string) =>
    new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth > 0);
        img.onerror = () => resolve(false);
        img.src = src;
    });

const RewardsHeroScene: React.FC = () => {
    const { tiers } = useCashbackProgram();
    const { currency } = useSitePreferences();
    const [imagesOk, setImagesOk] = useState<boolean | null>(null);
    const [games, setGames] = useState<Game[] | null>(null);

    const services = useMemo(
        () => ({
            apiClient: container.get<IApiClient>(IDENTIFIERS.IApiClient),
            urlService: container.get<IUrlService>(IDENTIFIERS.IUrlService),
        }),
        []
    );

    useEffect(() => {
        let active = true;
        Promise.all(Object.values(LAYERS).map(loads)).then((results) => {
            if (active) {
                setImagesOk(results.every(Boolean));
            }
        });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const response = await services.apiClient.api.get(
                    `/api/game/catalog?sort=popular&pageSize=${FAN.length}&currency=${encodeURIComponent(currency)}`
                );
                if (active) {
                    setGames((response.data?.items ?? []) as Game[]);
                }
            } catch {
                if (active) {
                    setGames([]);
                }
            }
        })();
        return () => {
            active = false;
        };
    }, [currency, services]);

    // Самое позднее появление в сцене заканчивается около 2.8 с (бейдж и звёзды).
    const settled = useSettled(Boolean(imagesOk) && games !== null, 3200);

    // Пока идёт проверка — пустое место нужного размера, чтобы вектор не мелькнул и не сменился.
    if (imagesOk === null || games === null) {
        return <div className="rewards-hero-scene" aria-hidden="true" />;
    }

    if (!imagesOk || games.length < FAN.length) {
        return <RewardsHeroArt />;
    }

    // Бейдж считает кэшбэк за игру, лежащую сверху веера, — на неё смотрят первой.
    const topGame = games[FAN.length - 1];
    const back = cashbackForOrder(Number(topGame.finalPrice ?? topGame.price ?? 0), tiers[0]);

    return (
        <div className={`rewards-hero-scene is-photo${settled ? " is-settled" : ""}`} aria-hidden="true">
            <span className="rw-scene-glow" />

            <div className="rw-depth rw-depth-key rw-scene-covers">
                {games.slice(0, FAN.length).map((game, index) => (
                    <div
                        key={game.id ?? index}
                        className="rw-cover-slot"
                        style={{
                            left: `${FAN[index].left}%`,
                            top: `${FAN[index].top}%`,
                            transform: `rotate(${FAN[index].rotate}deg)`,
                        }}
                    >
                        <Cover className="rw-cover" style={{ "--i": index } as React.CSSProperties} ratio="portrait" sizes="200px" src={game.imagePath} title={game.title ?? game.name} baseUrl={services.urlService.apiBaseUrl} imgProps={{ draggable: false }} />
                    </div>
                ))}
            </div>

            <div className="rw-depth rw-depth-stack rw-scene-wallet">
                <img className="rw-stack-drop" src={LAYERS.wallet} alt="" draggable={false} />
            </div>

            <div className="rw-depth rw-depth-fly rw-scene-badge-layer">
                <span className="rw-scene-badge">
                    <b>+{formatMoney(back, currency)}</b> back
                </span>
            </div>

            <div className="rw-depth rw-depth-fly">
                {FLYING.map((star) => (
                    <span
                        key={star.i}
                        className="rw-fly rw-scene-fly"
                        style={
                            {
                                left: `${star.left}%`,
                                top: `${star.top}%`,
                                width: `${star.size}%`,
                                "--i": star.i,
                                "--dx": `${ORIGIN.left - star.left}cqw`,
                                "--dy": `${ORIGIN.top - star.top}cqh`,
                            } as React.CSSProperties
                        }
                    >
                        <span className="rw-fly-bob">
                            <img className="rw-fly-spin" src={LAYERS.star} alt="" draggable={false} />
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
};

export default RewardsHeroScene;
