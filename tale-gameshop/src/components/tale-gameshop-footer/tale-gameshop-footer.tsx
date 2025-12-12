import React from "react";
import './tale-gameshop-footer.css'
import { Link } from "react-router-dom";

export default function TaleGameshopFooter() {
    return (
        <footer className="p-6 border-t border-gray-200 bg-white">
            <div className="container mx-auto footer-wrap">
                <div className="text-2xl font-bold">Tale Shop</div>
                <div className="footer-links">
                    <Link to="/games" className="text-gray-500 hover:text-gray-800">Game Store</Link>
                    <Link to="/about" className="text-gray-500 hover:text-gray-800">About Us</Link>
                    <Link to="/apologyPage" className="text-gray-500 hover:text-gray-800">Contact Us</Link>
                    <Link to="/apologyPage" className="text-gray-500 hover:text-gray-800">Help Centre</Link>
                    <Link to="/apologyPage" className="text-gray-500 hover:text-gray-800">FAQs</Link>
                </div>
                <div className="footer-social">
                    <a href="#" className="text-gray-600 hover:text-gray-900"><i className="fab fa-facebook"></i></a>
                    <a href="#" className="text-gray-600 hover:text-gray-900"><i className="fab fa-instagram"></i></a>
                    <a href="#" className="text-gray-600 hover:text-gray-900"><i className="fab fa-twitter"></i></a>
                    <a href="#" className="text-gray-600 hover:text-gray-900"><i className="fab fa-linkedin"></i></a>
                    <a href="#" className="text-gray-600 hover:text-gray-900"><i className="fab fa-youtube"></i></a>
                </div>
            </div>
        </footer>
    );
}