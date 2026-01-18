import React from 'react';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faArrowLeft,
    faArrowRight,
    faChevronLeft,
    faChevronRight
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import { useRecommendations } from '../../../hooks/use-recommendations';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import './account-billing-page.css';

const paymentMethods = [
    {
        id: 'visa-4242',
        brand: 'Visa',
        ending: '4242',
        label: 'Primary card',
        expiry: '04/26'
    },
    {
        id: 'mc-1121',
        brand: 'Mastercard',
        ending: '1121',
        label: 'Business card',
        expiry: '09/25'
    }
];

const invoices = [
    {
        order: '#170582',
        id: '#70762',
        date: 'April 15, 2024',
        amount: '$59.99'
    },
    {
        order: '#169741',
        id: '#169741',
        date: 'April 5, 2024',
        amount: '$29.99'
    },
    {
        order: '#165320',
        id: '#165320',
        date: 'March 28, 2023',
        amount: '$29.99'
    },
    {
        order: '#154879',
        id: '#154879',
        date: 'March 22, 2024',
        amount: '$39.99'
    }
];

const AccountBillingPage: React.FC = () => {
    const {
        items: recommendations,
        isLoading: isRecommendationsLoading,
        error: recommendationsError,
        reload: reloadRecommendations
    } = useRecommendations(6);

    return (
        <AccountShell
            title="My account"
            sectionLabel="Billing"
            subtitle={<h2 className="billing-title">Billing</h2>}
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
            <div className="card billing-card">
                <div className="billing-card-header">
                    <h3>Saved payment methods</h3>
                </div>
                <div className="billing-form-grid">
                    <label className="billing-field">
                        <span>Display name</span>
                        <input className="billing-input" type="text" defaultValue="Alex R." />
                    </label>
                    <label className="billing-field">
                        <span>Email address</span>
                        <div className="billing-input-with-icon">
                            <input
                                className="billing-input"
                                type="email"
                                defaultValue="hohlov908@gmail.com"
                            />
                            <FontAwesomeIcon icon={faChevronRight} />
                        </div>
                    </label>
                </div>
                <div className="billing-methods">
                    {paymentMethods.map((method) => (
                        <div key={method.id} className="billing-method-card">
                            <div>
                                <span className="billing-method-brand">{method.brand}</span>
                                <p>•••• {method.ending}</p>
                            </div>
                            <div className="billing-method-meta">
                                <span className="billing-method-label">{method.label}</span>
                                <span>Expires {method.expiry}</span>
                            </div>
                        </div>
                    ))}
                    <button type="button" className="btn btn-outline billing-add-btn">
                        Add method
                    </button>
                </div>
                <div className="billing-card-footer">
                    <button type="button" className="billing-link-btn">
                        Manage payment methods
                    </button>
                    <button type="button" className="btn btn-primary billing-save-btn" disabled>
                        Save changes
                    </button>
                </div>
            </div>

            <div className="card billing-card">
                <div className="billing-card-header">
                    <h3>Billing details</h3>
                    <button type="button" className="billing-link-btn">
                        Edit
                    </button>
                </div>
                <div className="billing-details">
                    <p>Alex R.</p>
                    <p>1234 Main St, Apt 56</p>
                    <p>Kyiv</p>
                    <p>Ukraine, UA 01001</p>
                    <p>+380 11 234 5678</p>
                </div>
            </div>

            <div className="card billing-card">
                <div className="billing-card-header">
                    <h3>Invoices</h3>
                </div>
                <div className="billing-table-wrapper">
                    <table className="billing-table">
                        <thead>
                        <tr>
                            <th>Order</th>
                            <th>ID</th>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Invoice</th>
                        </tr>
                        </thead>
                        <tbody>
                        {invoices.map((invoice) => (
                            <tr key={invoice.order}>
                                <td>{invoice.order}</td>
                                <td>{invoice.id}</td>
                                <td>{invoice.date}</td>
                                <td>{invoice.amount}</td>
                                <td>
                                    <button type="button" className="btn btn-outline billing-download-btn">
                                        Download PDF
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
                <div className="billing-pagination">
                    <div className="billing-pagination-controls">
                        <button type="button" className="btn btn-outline billing-page-btn" aria-label="Previous page">
                            <FontAwesomeIcon icon={faChevronLeft} />
                        </button>
                        <button type="button" className="btn btn-outline billing-page-btn is-active">
                            1
                        </button>
                        <button type="button" className="btn btn-outline billing-page-btn">
                            2
                        </button>
                        <button type="button" className="btn btn-outline billing-page-btn">
                            3
                        </button>
                        <button type="button" className="btn btn-outline billing-page-btn" aria-label="Next page">
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                    <span className="billing-pagination-note">Showing 1-4 of 22</span>
                </div>
            </div>

            <div className="card billing-card billing-privacy-card">
                <div className="billing-card-header">
                    <h3>Privacy &amp; data</h3>
                </div>
                <div className="billing-privacy-row">
                    <label className="billing-checkbox">
                        <input type="checkbox" />
                        Hide owned games in profile
                    </label>
                    <button type="button" className="btn btn-outline billing-download-btn">
                        Download my data
                    </button>
                </div>
            </div>

            <section className="billing-recommendations">
                <div className="billing-recommendations-header">
                    <h3>Recommendations based on your wishlist</h3>
                    <div className="billing-recommendations-arrows">
                        <button type="button" className="btn btn-outline billing-arrow-btn" aria-label="Scroll left">
                            <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <button type="button" className="btn btn-outline billing-arrow-btn" aria-label="Scroll right">
                            <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                    </div>
                </div>
                <RecommendationsSection
                    items={recommendations}
                    isLoading={isRecommendationsLoading}
                    error={recommendationsError}
                    onRetry={reloadRecommendations}
                    emptyMessage="Add games to your wishlist or view a few games to get recommendations."
                    listClassName="billing-recommendations-list"
                    stateClassName="billing-recommendations-state"
                    renderSkeleton={(index) => (
                        <div key={`rec-skeleton-${index}`} className="card billing-recommendation-card is-skeleton" />
                    )}
                    renderItem={(item) => (
                        <div key={item.game.id ?? item.game.title} className="card billing-recommendation-card">
                            <div className="billing-recommendation-media">
                                {item.game.imagePath ? (
                                    <img src={item.game.imagePath} alt={item.game.title} />
                                ) : (
                                    <div className="billing-recommendation-fallback" aria-hidden="true" />
                                )}
                            </div>
                            <div className="billing-recommendation-body">
                                <strong>{item.game.title}</strong>
                                <span className="billing-recommendation-price">
                                    ${Number(item.game.price).toFixed(2)}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary billing-recommendation-btn"
                                disabled={!item.game.id}
                            >
                                Add to cart
                            </button>
                        </div>
                    )}
                />
            </section>
        </AccountShell>
    );
};

export default AccountBillingPage;
