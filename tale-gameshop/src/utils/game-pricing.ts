import { Game } from '../models/game';

/**
 * Цена, которую покупатель заплатит сейчас. Скидку считает сервер — здесь только защита
 * от отсутствующего или нечислового поля, чтобы карточка не показала «$NaN».
 */
export const finalPriceOf = (game: Game): number => {
    const regular = Number.isFinite(game.price) ? Number(game.price) : 0;
    return Number.isFinite(game.finalPrice ?? NaN) ? Number(game.finalPrice) : regular;
};

/**
 * Показывать ли скидку. Мало флага `discountActive`: скидка в 0% или та, что не опустила
 * цену, зачёркнутой цены не заслуживает — иначе витрина обещает выгоду, которой нет.
 */
export const hasVisibleDiscount = (game: Game): boolean =>
    Boolean(
        game.discountActive &&
        game.discountPercent &&
        game.discountPercent > 0 &&
        finalPriceOf(game) < Number(game.price)
    );

/** Размер скидки для бейджа, целыми процентами. Ноль — скидку рисовать не нужно. */
export const discountPercentOf = (game: Game): number =>
    hasVisibleDiscount(game) ? Math.round(Number(game.discountPercent)) : 0;
