import React from "react";
import './tale-gameshop-footer.css'
import { Link } from "react-router-dom";

export default function TaleGameshopFooter() {
    return (
        <footer className="footer">
            <div className="container">
                <div className="footer-top">
                    <div className="footer-brand">
                        <div className="footer-logo">Tale Shop</div>
                        <p>Curated PC games with secure checkout, instant delivery, and weekly highlights.</p>
                    </div>

                    <div className="footer-columns">
                        <div className="footer-column">
                            <div className="footer-title">Store</div>
                            <Link to="/games">All games</Link>
                            <Link to="/games?filterCategory=Deals">Deals</Link>
                            <Link to="/games?filterCategory=Collections">Collections</Link>
                            <Link to="/games?filterCategory=Bestsellers">Bestsellers</Link>
                        </div>

                        <div className="footer-column">
                            <div className="footer-title">Company</div>
                            <Link to="/about">About</Link>
                            <Link to="/blog">Blog</Link>
                            <Link to="/apologyPage">Support</Link>
                        </div>

                        <div className="footer-column">
                            <div className="footer-title">Legal</div>
                            <Link to="/apologyPage">Terms</Link>
                            <Link to="/apologyPage">Privacy</Link>
                            <Link to="/apologyPage">Refunds</Link>
                        </div>

                        <div className="footer-column">
                            <div className="footer-title">Languages</div>
                            <div className="language-switch">
                                <span className="lang active">EN</span>
                                <span className="lang">RU</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="footer-divider" />

            <div className="container">
                <div className="footer-bottom">
                    <span className="muted">© 2025 Tale Shop</span>
                    <div className="footer-meta">
                        <div className="footer-payments" aria-label="Payment methods">
                            <span className="pill">Pay</span>
                            <span className="pill">Card</span>
                            <span className="pill">Wallet</span>
                            <span className="pill">Secure</span>
                        </div>
                        <div className="footer-social" aria-label="Social links">
                            <a href="/apologyPage" aria-label="Discord" className="icon-circle">D</a>
                            <a href="/apologyPage" aria-label="Twitter" className="icon-circle">T</a>
                            <a href="/apologyPage" aria-label="YouTube" className="icon-circle">Y</a>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}