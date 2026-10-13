import { useTranslation } from 'react-i18next';
import React, {useEffect, useRef, useState} from "react";
import {Link} from "react-router-dom";
import "./cart-icon.css";
import {faShoppingCart} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import { useCart } from "../../../context/cart-context";
import { CART_TARGET_ATTR, flightsInProgress, onCartLanding } from "../cart-flight";

interface CartIconProps {
    isText: boolean;
}

const FLIP_MS = 380;

/**
 * Корзина в шапке. Число товаров меняется не молча: иконка подпрыгивает, кружок вспыхивает, старая цифра
 * уезжает вверх, новая приезжает снизу. Если в этот момент к корзине летит обложка (см. cart-flight.ts),
 * число ждёт её приземления — иначе счётчик менялся бы раньше, чем товар «долетел».
 */
const CartIcon: React.FC<CartIconProps> = ({ isText }) => {
    const { t } = useTranslation();
    const { state } = useCart();
    const totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0); // Сумма количества товаров

    const [shown, setShown] = useState(totalItems);
    const [previous, setPrevious] = useState<number | null>(null);
    const [bump, setBump] = useState(false);
    const shownRef = useRef(totalItems);

    useEffect(() => {
        if (totalItems === shownRef.current) {
            return;
        }
        const grew = totalItems > shownRef.current;
        let cancelled = false;
        let unsubscribe = () => {};

        const apply = () => {
            if (cancelled) {
                return;
            }
            const from = shownRef.current;
            shownRef.current = totalItems;
            setShown(totalItems);
            if (grew) {
                setPrevious(from > 0 ? from : null);
                setBump(true);
            }
        };

        if (grew && flightsInProgress() > 0) {
            unsubscribe = onCartLanding(() => { unsubscribe(); apply(); });
        } else {
            apply();
        }
        return () => { cancelled = true; unsubscribe(); };
    }, [totalItems]);

    useEffect(() => {
        if (!bump) {
            return;
        }
        const timer = window.setTimeout(() => { setBump(false); setPrevious(null); }, FLIP_MS + 200);
        return () => window.clearTimeout(timer);
    }, [bump]);

    if (isText) {
        return (
            <Link to="/cart" className="cursor-pointer">
                <FontAwesomeIcon className="hidden lg:flex text-2xl" icon={faShoppingCart}/>
                <div className="lg:hidden text-gray-700 menu-item cursor-pointer">{t('cart.iconLabel')}</div>
            </Link>
        );
    }

    return (
        <Link
            to="/cart"
            className={`cursor-pointer relative cart-icon${bump ? " is-bump" : ""}`}
            aria-label={shown > 0 ? t('cart.iconLabelCount', { count: shown }) : t('cart.iconLabel')}
            {...{ [CART_TARGET_ATTR]: "" }}
        >
            <FontAwesomeIcon className="text-2xl cart-icon-glyph" icon={faShoppingCart} />
            {shown > 0 && (
                <span className="cart-icon-badge absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 flex items-center justify-center" data-testid="cart-count">
                    <span className="cart-icon-digits" aria-hidden={previous !== null}>
                        {previous !== null && <span className="cart-icon-digit is-out">{previous}</span>}
                        <span className={`cart-icon-digit${previous !== null ? " is-in" : ""}`}>{shown}</span>
                    </span>
                </span>
            )}
        </Link>
    );
}

export default CartIcon;
