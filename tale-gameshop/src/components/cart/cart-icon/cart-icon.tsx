import React from "react";
import {Link} from "react-router-dom";
import "./cart-icon.css";
import {faShoppingCart} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import { useCart } from "../../../context/cart-context";

interface CartIconProps {
    isText: boolean;
}

const CartIcon: React.FC<CartIconProps> = ({ isText }) => {
    const { state } = useCart();
    const totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0); // Сумма количества товаров

    return (
        <>
            { isText &&
                (<Link to="/cart" className="cursor-pointer">
                    <FontAwesomeIcon className="hidden lg:flex text-2xl" icon={faShoppingCart}/>
                    <div className="lg:hidden text-gray-700 menu-item cursor-pointer">Cart</div>
                </Link>)
            }
            { !isText &&
                (<Link to="/cart" className="cursor-pointer relative">
                    <FontAwesomeIcon className="text-2xl" icon={faShoppingCart} />
                    {totalItems > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            {totalItems}
                        </span>
                    )}
                </Link>)
            }
        </>
    );
}

export default CartIcon;