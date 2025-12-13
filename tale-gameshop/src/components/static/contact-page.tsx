import React from 'react';

const ContactPage: React.FC = () => {
    return (
        <div className="container">
            <div className="card">
                <h1 className="section-title">Contact Us</h1>
                <p className="section-subtitle">Have a question about Tale Shop? Reach out and our team will respond within one business day.</p>
                <div className="grid-responsive">
                    <div className="card">
                        <h3>Support Inbox</h3>
                        <p>support@talestore.games</p>
                        <p className="section-subtitle">Send us a note with your order number for the fastest help.</p>
                    </div>
                    <div className="card">
                        <h3>Community Chat</h3>
                        <p>@tale_shop_chat on Telegram</p>
                        <p className="section-subtitle">Ping us for quick troubleshooting or pre-purchase questions.</p>
                    </div>
                    <div className="card">
                        <h3>Feedback Form</h3>
                        <p className="section-subtitle">Tell us what to improve. We read every message.</p>
                        <button className="btn btn-outline">Open feedback form</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContactPage;
