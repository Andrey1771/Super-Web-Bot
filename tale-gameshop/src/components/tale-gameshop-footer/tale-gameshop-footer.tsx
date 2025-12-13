import React from "react";
import './tale-gameshop-footer.css';
import { Link } from "react-router-dom";

export default function TaleGameshopFooter() {
    return (
        <footer className="footer">
            <div className="container footer-inner">
                <div className="footer-brand">Tale Shop</div>
                <div className="footer-links">
                    <Link to="/games">Game Store</Link>
                    <Link to="/about">About Us</Link>
                    <Link to="/contact">Contact Us</Link>
                    <Link to="/help">Help Centre</Link>
                    <Link to="/faqs">FAQs</Link>
                </div>
            </div>
        </footer>
    );
}
