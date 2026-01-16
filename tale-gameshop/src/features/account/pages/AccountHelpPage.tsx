import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faChevronDown, faFileLines} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import './account-help-page.css';

const supportRequests = [
    {
        id: '#10482',
        issue: 'Payment failed',
        status: 'Open',
        updated: '2 hours ago',
        statusStyle: 'open'
    },
    {
        id: '#10411',
        issue: 'Key delivery delay',
        status: 'Waiting for response',
        updated: 'Yesterday',
        statusStyle: 'waiting'
    },
    {
        id: '#10377',
        issue: 'Refund request',
        status: 'Resolved',
        updated: '5 days ago',
        statusStyle: 'resolved'
    }
];

const faqItems = [
    {
        question: 'Where is my game key?',
        answer:
            'Keys are delivered instantly after payment, but some banks need additional checks. ' +
            'If it has been more than 30 minutes, refresh your orders page or contact support.'
    },
    {question: 'How do refunds work?'},
    {question: 'Payment was charged but order is missing'},
    {question: 'How to download an invoice?'},
    {question: 'How to activate a Steam key?'},
    {question: 'How to secure my account?'}
];

const guideLinks = ['Activation guide', 'Refund policy', 'Payment methods', 'Regional restrictions'];

const systemStatuses = [
    {label: 'Store', status: 'Operational'},
    {label: 'Checkout', status: 'Operational'},
    {label: 'Key delivery', status: 'Operational'},
    {label: 'Support чат', status: 'Operational'}
];

const AccountHelpPage: React.FC = () => {
    return (
        <AccountShell title="Help" sectionLabel="Help">
            <div className="help-page">
                <section className="card help-support">
                    <div className="help-section-header">
                        <h2>My support requests</h2>
                        <button type="button" className="btn btn-primary help-action-btn">
                            New request
                        </button>
                    </div>
                    <div className="help-requests-table">
                        <div className="help-requests-row help-requests-head">
                            <span>Request</span>
                            <span>Subject</span>
                            <span>Status</span>
                            <span>Updated</span>
                            <span />
                        </div>
                        {supportRequests.map((request) => (
                            <div className="help-requests-row" key={request.id}>
                                <strong>{request.id}</strong>
                                <span>{request.issue}</span>
                                <span className={`help-status-pill ${request.statusStyle}`}>{request.status}</span>
                                <span className="help-muted">{request.updated}</span>
                                <button type="button" className="btn btn-outline help-view-btn">
                                    View
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="card help-faq">
                    <div className="help-section-header">
                        <h2>FAQ</h2>
                    </div>
                    <div className="help-accordion">
                        {faqItems.map((item, index) => {
                            const isOpen = index === 0;

                            return (
                                <div
                                    key={item.question}
                                    className={`help-accordion-item${isOpen ? ' is-open' : ''}`}
                                >
                                    <button type="button" className="help-accordion-trigger">
                                        <span>{item.question}</span>
                                        <FontAwesomeIcon icon={faChevronDown} />
                                    </button>
                                    {isOpen && (
                                        <p className="help-accordion-content">{item.answer}</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                <div className="help-info-grid">
                    <section className="card help-guides">
                        <h3>Guides &amp; policies</h3>
                        <ul>
                            {guideLinks.map((guide) => (
                                <li key={guide}>
                                    <span className="help-doc-icon" aria-hidden="true">
                                        <FontAwesomeIcon icon={faFileLines} />
                                    </span>
                                    <span>{guide}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="card help-status">
                        <h3>System status</h3>
                        <div className="help-status-indicator">
                            <span className="help-status-dot" aria-hidden="true" />
                            <span>All systems operational</span>
                        </div>
                        <div className="help-status-list">
                            {systemStatuses.map((system) => (
                                <div key={system.label} className="help-status-row">
                                    <span>{system.label}</span>
                                    <span className="help-system-tag">{system.status}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <section className="card help-cta">
                    <div className="help-cta-content">
                        <h3>Still need help?</h3>
                        <p>Our team answers 24/7. Average response time: 2-6 hours.</p>
                        <div className="help-cta-actions">
                            <button type="button" className="btn btn-primary help-action-btn">
                                Contact support
                            </button>
                            <button type="button" className="btn btn-outline help-secondary-btn">
                                Open live chat
                            </button>
                        </div>
                        <span className="help-cta-note">
                            Please include order ID or Support ID when possible.
                        </span>
                    </div>
                </section>
            </div>
        </AccountShell>
    );
};

export default AccountHelpPage;
