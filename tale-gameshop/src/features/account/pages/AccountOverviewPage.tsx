import React from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faBagShopping,
    faCreditCard,
    faKey,
    faHeart
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import {
    accountProfile,
    accountQuickStats,
    getRecentKeys,
    getRecentOrders,
    getRecommendations
} from '../mockAccountData';
import {useCart} from '../../../context/cart-context';
import './account-overview-page.css';

const AccountOverviewPage: React.FC = () => {
    const orders = getRecentOrders();
    const keys = getRecentKeys();
    const recommendations = getRecommendations();
    const {dispatch} = useCart();
    const navigate = useNavigate();

    const handleInvoiceView = (orderId: string) => {
        console.log(`TODO: open invoice for ${orderId}`);
    };

    const handleViewKeys = (keyId?: string) => {
        if (keyId) {
            navigate(`/account/keys#${keyId}`);
            return;
        }
        navigate('/account/keys');
    };

    const handleAddToCart = (id: string, title: string, price: number, image: string) => {
        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: id,
                name: title,
                price,
                quantity: 1,
                image
            }
        });
    };

    return (
        <AccountShell
            title="Account overview"
            sectionLabel="Account overview"
            subtitle="Manage your purchases, keys, and account settings."
        >
            <div className="card account-card account-profile-card">
                <div className="account-profile-summary">
                    <div className="account-avatar account-avatar-lg">{accountProfile.initials}</div>
                    <div>
                        <h2>{accountProfile.name}</h2>
                        <p className="account-profile-email">{accountProfile.email}</p>
                        <span className="badge">{accountProfile.badge}</span>
                        <p className="account-member-since">Member since {accountProfile.memberSince}</p>
                    </div>
                </div>
                <Link to="/account/settings" className="btn btn-primary account-action-btn">
                    Edit profile
                </Link>
            </div>

            <div className="account-quick-actions">
                <div className="card account-card account-action-card">
                    <div className="account-action-header">
                        <FontAwesomeIcon icon={faBagShopping} />
                        <h3>Orders</h3>
                    </div>
                    <p>View your orders and invoices</p>
                    <div className="account-action-footer">
                        <strong>{accountQuickStats.orders}</strong>
                        <Link to="/account/orders" className="btn btn-outline account-action-btn">
                            View
                        </Link>
                    </div>
                </div>
                <div className="card account-card account-action-card">
                    <div className="account-action-header">
                        <FontAwesomeIcon icon={faKey} />
                        <h3>Keys &amp; activation</h3>
                    </div>
                    <p>Reveal, copy and activate keys</p>
                    <div className="account-action-footer">
                        <strong>{accountQuickStats.keys}</strong>
                        <Link to="/account/keys" className="btn btn-outline account-action-btn">
                            Open
                        </Link>
                    </div>
                </div>
                <div className="card account-card account-action-card">
                    <div className="account-action-header">
                        <FontAwesomeIcon icon={faHeart} />
                        <h3>Saved items</h3>
                    </div>
                    <p>Wishlist for future purchases</p>
                    <div className="account-action-footer">
                        <strong>{accountQuickStats.saved}</strong>
                        <Link to="/account/saved" className="btn btn-outline account-action-btn">
                            Open
                        </Link>
                    </div>
                </div>
                <div className="card account-card account-action-card">
                    <div className="account-action-header">
                        <FontAwesomeIcon icon={faCreditCard} />
                        <h3>Billing</h3>
                    </div>
                    <p>Payment methods and invoices</p>
                    <div className="account-action-footer">
                        <strong>{accountQuickStats.billing}</strong>
                        <Link to="/account/billing" className="btn btn-outline account-action-btn">
                            Manage
                        </Link>
                    </div>
                </div>
            </div>

            <div className="card account-card">
                <div className="account-section-header">
                    <h3>Recent orders</h3>
                    <Link to="/account/orders">View all</Link>
                </div>
                <div className="account-table-wrapper">
                    <table className="account-table">
                        <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>Game</th>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Invoice</th>
                        </tr>
                        </thead>
                        <tbody>
                        {orders.map((order) => (
                            <tr key={order.id}>
                                <td>{order.id}</td>
                                <td>{order.game}</td>
                                <td>{order.date}</td>
                                <td>{order.amount}</td>
                                <td>
                                    <button
                                        type="button"
                                        className="btn btn-outline account-action-btn"
                                        onClick={() => handleInvoiceView(order.id)}
                                    >
                                        View
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card account-card">
                <div className="account-section-header">
                    <h3>Recent keys</h3>
                    <Link to="/account/keys">View all</Link>
                </div>
                <div className="account-key-list">
                    {keys.map((key) => (
                        <div key={key.id} className="account-key-item">
                            <div>
                                <strong>{key.game}</strong>
                                <div className="account-key-meta">
                                    <span>{key.platform}</span>
                                    <span>-</span>
                                    <span>{key.date}</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-outline account-action-btn"
                                onClick={() => handleViewKeys(key.id)}
                            >
                                View keys
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="card account-card">
                <div className="account-section-header">
                    <h3>Recommendations based on your wishlist</h3>
                </div>
                <div className="account-recommendations">
                    {recommendations.map((item) => (
                        <div key={item.id} className="account-recommendation-card">
                            <div className="account-recommendation-media">
                                <img src={item.image} alt={item.title} />
                            </div>
                            <div className="account-recommendation-body">
                                <strong>{item.title}</strong>
                                <span className="account-recommendation-price">${item.price.toFixed(2)}</span>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary account-recommendation-btn"
                                onClick={() => handleAddToCart(item.id, item.title, item.price, item.image)}
                            >
                                Add to cart
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </AccountShell>
    );
};

export default AccountOverviewPage;
