import React from "react";
import './tale-gameshop-footer.css'
import { Link } from "react-router-dom";

export default function TaleGameshopFooter() {
    return (
        <footer className="p-4 border-t border-gray-200 app-footer bg-white">
            <div className="container mx-auto flex flex-col lg:flex-row gap-4 lg:gap-0 items-center justify-between">
                <div className="text-2xl font-bold">Tale Shop</div>
                <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-600">
                    <Link to="/games" className="text-gray-700">Game Store</Link>
                    <Link to="/about" className="text-gray-700">About Us</Link>
                    <Link to="/apologyPage" className="text-gray-700">Contact Us</Link>
                    <Link to="/apologyPage" className="text-gray-700">Help Centre</Link>
                    <Link to="/apologyPage" className="text-gray-700">FAQs</Link>
                </div>
                <div className="flex items-center space-x-4 text-gray-700">
                    <a href="#" className="text-black"><i className="fab fa-facebook"></i></a>
                    <a href="#" className="text-black"><i className="fab fa-instagram"></i></a>
                    <a href="#" className="text-black"><i className="fab fa-twitter"></i></a>
                    <a href="#" className="text-black"><i className="fab fa-linkedin"></i></a>
                    <a href="#" className="text-black"><i className="fab fa-youtube"></i></a>
                </div>
            </div>
        </footer>
    );
}
