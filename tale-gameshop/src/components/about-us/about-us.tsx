import React from "react";
import './about-us.css';

export default function AboutUs() {
    return (
        <div className="container">
            <div className="card about-card">
                <h1 className="section-title">About Tale Shop</h1>
                <p className="section-subtitle">We are a small team of gamers building a clean, reliable place to buy PC games.</p>

                <div className="about-grid">
                    <div className="card">
                        <h3>What we do</h3>
                        <p className="section-subtitle">We hand-pick game keys from trusted publishers and deliver them instantly to your library.</p>
                    </div>
                    <div className="card">
                        <h3>How we support you</h3>
                        <p className="section-subtitle">Real people answer every ticket. Most questions are solved in under a business day.</p>
                    </div>
                    <div className="card">
                        <h3>Why players stay</h3>
                        <p className="section-subtitle">Transparent pricing, secure payments, and a catalog that focuses on quality over quantity.</p>
                    </div>
                </div>

                <div className="about-cta">
                    <div>
                        <h3>Ready to explore?</h3>
                        <p className="section-subtitle">Browse the store and find a new favorite tonight.</p>
                    </div>
                    <a className="btn btn-primary" href="/games">Open the store</a>
                </div>
            </div>
        </div>
    );
}
