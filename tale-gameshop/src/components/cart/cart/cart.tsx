import React from 'react';
import {useCart} from '../../../context/cart-context';
import {Link} from "react-router-dom";
import container from "../../../inversify.config";
import {IUrlService} from "../../../iterfaces/i-url-service";
import IDENTIFIERS from "../../../constants/identifiers";
import './cart.css';
import placeholderOne from "../../../assets/images/placeholder-1.svg";

const Cart: React.FC = () => {
    const {state, dispatch} = useCart();
    const totalPrice = state.items.reduce((total, item) => total + item.price * item.quantity, 0);
    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    const handleIncreaseQuantity = (id: string) => {
        dispatch({type: 'INCREASE_QUANTITY', payload: id});
    };

    const handleDecreaseQuantity = (id: string) => {
        dispatch({type: 'DECREASE_QUANTITY', payload: id});
    };

    if (state.items.length === 0) {
        return (
            <div className="card cart-empty">
                <h2>Your cart is empty</h2>
                <p className="section-subtitle">Add some games to see them here.</p>
                <Link className="btn btn-primary" to="/games">Back to store</Link>
            </div>
        );
    }

    return (
        <div className="cart-layout">
            <div className="card cart-items">
                <h2 className="section-title">Your Cart</h2>
                {state.items.map((item) => (
                    <div key={item.gameId} className="cart-row">
                        <div className="cart-row__image">
                            <img
                                src={`${urlService.apiBaseUrl}/${item.image}`}
                                alt={item.name}
                                onError={(event) => event.currentTarget.src = placeholderOne}
                            />
                        </div>
                        <div className="cart-row__info">
                            <span className="cart-row__title">{item.name}</span>
                            <span className="cart-row__price">${item.price.toFixed(2)}</span>
                        </div>
                        <div className="cart-row__quantity">
                            <button onClick={() => handleDecreaseQuantity(item.gameId)}>-</button>
                            <span>{item.quantity}</span>
                            <button onClick={() => handleIncreaseQuantity(item.gameId)}>+</button>
                        </div>
                        <div className="cart-row__total">
                            ${(item.price * item.quantity).toFixed(2)}
                        </div>
                        <button
                            onClick={() => dispatch({type: 'REMOVE_FROM_CART', payload: item.gameId})}
                            className="cart-row__remove"
                        >
                            Remove
                        </button>
                    </div>
                ))}
            </div>

            <div className="card cart-summary">
                <h3>Order Summary</h3>
                <div className="cart-summary__row">
                    <span>Total</span>
                    <span className="cart-summary__price">${totalPrice.toFixed(2)}</span>
                </div>
                <div className="cart-summary__actions">
                    <button
                        onClick={() => dispatch({type: 'CLEAR_CART'})}
                        className="btn btn-outline"
                    >
                        Clear Cart
                    </button>
                    <Link
                        className="btn btn-primary"
                        to="/checkout"
                    >
                        Proceed to Checkout
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default Cart;
