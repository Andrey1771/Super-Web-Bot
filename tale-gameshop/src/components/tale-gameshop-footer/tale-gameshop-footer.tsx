import React from "react";
import './tale-gameshop-footer.css'

export default function TaleGameshopFooter() {
    return (
        <footer className="flex items-center justify-between p-4 border-t border-gray-200">
            <div className="text-2xl font-bold">Tale Shop</div>
            <div className="flex items-center space-x-4">
                <a href="#" className="text-gray-500">Game Store</a>
                <a href="#" className="text-gray-500">About Us</a>
                <a href="#" className="text-gray-500">Contact Us</a>
                <a href="#" className="text-gray-500">Help Centre</a>
                <a href="#" className="text-gray-500">FAQs</a>
            </div>
            <div className="flex items-center space-x-4">
                <a href="#" className="text-black"><i className="fab fa-facebook"></i></a>
                <a href="#" className="text-black"><i className="fab fa-instagram"></i></a>
                <a href="#" className="text-black"><i className="fab fa-twitter"></i></a>
                <a href="#" className="text-black"><i className="fab fa-linkedin"></i></a>
                <a href="#" className="text-black"><i className="fab fa-youtube"></i></a>
            </div>
        </footer>
    );
}