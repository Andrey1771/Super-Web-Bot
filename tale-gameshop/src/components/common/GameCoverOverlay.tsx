import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faDesktop } from '@fortawesome/free-solid-svg-icons';
import { faApple, faLinux, faPlaystation, faXbox } from '@fortawesome/free-brands-svg-icons';
import { Game } from '../../models/game';
import { finalPriceOf, discountPercentOf, hasVisibleDiscount } from '../../utils/game-pricing';
import './game-cover-overlay.css';

// Ярлык платформы → иконка. Незнакомый ярлык просто не рисуется:
// лучше без иконки, чем с чужой.
const platformIcons: Record<string, IconDefinition> = {
    PC: faDesktop,
    Mac: faApple,
    Linux: faLinux,
    PlayStation: faPlaystation,
    Xbox: faXbox
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
    const discounted = hasVisibleDiscount(game);
    const platforms = (game.platforms ?? []).filter((platform) => platformIcons[platform]);

    return (
        <>
            {chip && <span className="gco-chip">{chip}</span>}
            {discounted && (
                <span className={`gco-discount gco-discount-${discountCorner}`}>−{discountPercentOf(game)}%</span>
            )}
            {/* Под полосой — затемняющий градиент: цена должна читаться на любом арте. */}
            <span className="gco-strip">
                <span className="gco-platforms">
                    {platforms.map((platform) => (
                        <FontAwesomeIcon key={platform} icon={platformIcons[platform]} title={platform} />
                    ))}
                </span>
                <span className="gco-price-group">
                    {discounted && <span className="gco-price-old">${Number(game.price).toFixed(2)}</span>}
                    <span className="gco-price">${finalPriceOf(game).toFixed(2)}</span>
                </span>
            </span>
        </>
    );
};

export default GameCoverOverlay;
