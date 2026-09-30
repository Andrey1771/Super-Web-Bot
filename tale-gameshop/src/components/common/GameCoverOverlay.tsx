import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faDesktop, faGamepad } from '@fortawesome/free-solid-svg-icons';
import { faApple, faLinux, faPlaystation, faXbox } from '@fortawesome/free-brands-svg-icons';
import { Game } from '../../models/game';
import { finalPriceOf, discountPercentOf, hasVisibleDiscount } from '../../utils/game-pricing';
import { useSitePreferences } from '../../context/site-preferences';
import { formatMoney } from '../../utils/format-money';
import { isSoftware, OS_SHORT } from '../../utils/software';
import './game-cover-overlay.css';

/**
 * Ярлык платформы → иконка, одна карта на карточку товара и фильтр каталога. Незнакомый ярлык просто не рисуется:
 * лучше без иконки, чем с чужой.
 */
export const PLATFORM_ICONS: Record<string, IconDefinition> = {
    PC: faDesktop,
    Mac: faApple,
    Linux: faLinux,
    PlayStation: faPlaystation,
    Xbox: faXbox,
    Nintendo: faGamepad
};

export interface GameCoverOverlayProps {
    game: Game;
    /** Метка в левом верхнем углу обложки: дата релиза, «Hot deal» и т.п. */
    chip?: string | null;
    /**
     * Угол для бейджа скидки. По умолчанию правый; каталог просит левый, потому что
     * справа у него живёт кнопка вишлиста. Невышедшая игра скидки не показывает
     * (её гасит сервер), поэтому чип и бейдж слева не сталкиваются.
     */
    discountCorner?: 'left' | 'right';
}

/**
 * То, что лежит поверх обложки товара: размер скидки, платформы ключа и цена.
 * Один компонент на всю витрину — полки главной и сетку каталога, — чтобы цена
 * везде выглядела одинаково и правилась в одном месте.
 */
const GameCoverOverlay: React.FC<GameCoverOverlayProps> = ({ game, chip, discountCorner = 'right' }) => {
    const { t } = useTranslation();
    const discounted = hasVisibleDiscount(game);
    const software = isSoftware(game.kind);
    // У ПО — системы короткими подписями (WIN · MAC · AND): значки Apple у macOS и iOS не различить.
    const platforms = software ? [] : (game.platforms ?? []).filter((platform) => PLATFORM_ICONS[platform]);
    const systems = software ? (game.platforms ?? []).filter((platform) => OS_SHORT[platform]) : [];
    const { currency: preferredCurrency } = useSitePreferences();
    // Валюта самой позиции важнее настройки. Настройка меняется мгновенно, а цены приезжают
    // следующим запросом: если форматировать по настройке, в этот промежуток на экране висит
    // прежнее число с новым значком — то есть цена, которой не существует.
    const currency = game.currency ?? preferredCurrency;

    return (
        <>
            {/* Левый верхний угол — одной строкой: метка, скидка и пометка «Software». По отдельности
                они стояли бы в одной точке и перекрывали друг друга. */}
            {(chip || software || (discounted && discountCorner === 'left')) && (
                <span className="gco-corner">
                    {chip && <span className="gco-chip">{chip}</span>}
                    {discounted && discountCorner === 'left' && (
                        <span className="gco-discount">−{discountPercentOf(game)}%</span>
                    )}
                    {/* Каталог общий: без пометки программу на обложке легко принять за игру. */}
                    {software && <span className="gco-kind">{t('common.software')}</span>}
                </span>
            )}
            {discounted && discountCorner === 'right' && (
                <span className="gco-discount gco-discount-right">−{discountPercentOf(game)}%</span>
            )}
            {/* Под полосой — затемняющий градиент: цена должна читаться на любом арте. */}
            <span className="gco-strip">
                <span className="gco-platforms">
                    {platforms.map((platform) => (
                        <FontAwesomeIcon key={platform} icon={PLATFORM_ICONS[platform]} title={platform} />
                    ))}
                    {systems.map((system) => (
                        <span key={system} className="gco-os" title={system}>{OS_SHORT[system]}</span>
                    ))}
                </span>
                <span className="gco-price-group">
                    {/* У ПО с несколькими лицензиями цена — самой дешёвой подходящей: «from». */}
                    {game.priceFrom && !discounted && <small className="gco-price-from">{t('common.from')}</small>}
                    {discounted && <span className="gco-price-old">{formatMoney(Number(game.price), currency)}</span>}
                    <span className="gco-price">{formatMoney(finalPriceOf(game), currency)}</span>
                </span>
            </span>
        </>
    );
};

export default GameCoverOverlay;
