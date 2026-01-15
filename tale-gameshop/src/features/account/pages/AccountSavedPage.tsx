import React from 'react';
import {Link} from 'react-router-dom';
import AccountShell from '../components/AccountShell';
import {useWishlist} from '../../../context/wishlist-context';
import {useCart} from '../../../context/cart-context';
import {Product} from '../../../reducers/cart-reducer';
import container from '../../../inversify.config';
import {IUrlService} from '../../../iterfaces/i-url-service';
import IDENTIFIERS from '../../../constants/identifiers';
import './account-saved-page.css';

const AccountSavedPage: React.FC = () => {
    const {state, removeFromWishlist, clearWishlist} = useWishlist();
    const {dispatch} = useCart();
    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    const handleAddToCart = (item: { gameId: string; name: string; price: number; image: string }) => {
        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: item.gameId,
                name: item.name,
                price: item.price,
                quantity: 1,
                image: item.image
            } as Product
        });
    };

    return (
        <AccountShell
            title="My account"
            sectionLabel="Saved items"
            subtitle={<h2 className="saved-title">Saved items</h2>}
            actions={(
                <>
                    <Link to="/account/settings" className="btn btn-outline account-action-btn">
                        Edit profile
                    </Link>
                    <Link to="/support" className="btn btn-primary account-action-btn">
                        Support
                    </Link>
                </>
            )}
        >
            <div className="card saved-card">
                <div className="saved-card-header">
                    <div>
                        <h3>Wishlist</h3>
                        <p className="saved-muted">Save games to keep track of future purchases.</p>
                    </div>
                    <button
                        type="button"
                        className="btn btn-outline saved-clear-btn"
                        onClick={clearWishlist}
                        disabled={state.items.length === 0}
                    >
                        Clear wishlist
                    </button>
                </div>

                {state.items.length === 0 ? (
                    <div className="saved-empty">
                        <p>Your wishlist is empty.</p>
                        <Link to="/games" className="btn btn-primary">
                            Browse catalog
                        </Link>
                    </div>
                ) : (
                    <div className="saved-grid">
                        {state.items.map((item) => (
                            <div key={item.gameId} className="saved-item">
                                <div className="saved-media">
                                    <img src={`${urlService.apiBaseUrl}/${item.image}`} alt={item.name} />
                                </div>
                                <div className="saved-body">
                                    <div>
                                        <h4>{item.name}</h4>
                                        <span className="saved-price">${item.price.toFixed(2)}</span>
                                    </div>
                                    <div className="saved-actions">
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={() => handleAddToCart(item)}
                                        >
                                            Add to cart
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            onClick={() => removeFromWishlist(item.gameId)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AccountShell>
    );
};

export default AccountSavedPage;
