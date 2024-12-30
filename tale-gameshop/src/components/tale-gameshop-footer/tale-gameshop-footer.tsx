import React from "react";
import './tale-gameshop-footer.css'
import { Link } from "react-router-dom";

export default function TaleGameshopFooter() {
    return (
        <footer className="p-4 border-t border-gray-200">
            <div className="container mx-auto flex items-center justify-between">
                <div className="text-2xl font-bold">Tale Shop</div>
                <div className="flex items-center space-x-4">
                    <Link to="/games" className="text-gray-500">Game Store</Link>
                    <Link to="/about" className="text-gray-500">About Us</Link>
                    <Link to="/apologyPage" className="text-gray-500">Contact Us</Link>
                    <Link to="/apologyPage" className="text-gray-500">Help Centre</Link>
                    <Link to="/apologyPage" className="text-gray-500">FAQs</Link>
                </div>
                <div className="flex items-center space-x-4">
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