import React from 'react';
import {Link} from "react-router-dom";
import './admin-panel-page.css';

const AdminPanelPage: React.FC = () => {
    const cards = [
        {title: 'Products', description: 'Manage the games catalog and pricing.', link: '/admin/cardAdder'},
        {title: 'Images', description: 'Update store visuals and banners.', link: '/admin/siteChanger'},
        {title: 'Bot Settings', description: 'Configure the chatbot replies and flows.', link: '/admin/botChanger'},
        {title: 'Users', description: 'Review user accounts and details.', link: '/admin/userInfo'},
        {title: 'Stats', description: 'Track recent activity and store metrics.', link: '/admin/userStats'},
    ];

    return (
        <div className="container">
            <div className="card admin-card">
                <div className="admin-header">
                    <div>
                        <h1 className="section-title">Admin Dashboard</h1>
                        <p className="section-subtitle">Quick links to the main management areas.</p>
                    </div>
                </div>
                <div className="admin-grid">
                    {cards.map((card) => (
                        <div className="card admin-tile" key={card.title}>
                            <h3>{card.title}</h3>
                            <p className="section-subtitle">{card.description}</p>
                            <Link className="btn btn-primary" to={card.link}>Open</Link>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AdminPanelPage;
