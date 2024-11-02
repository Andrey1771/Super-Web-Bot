import React from "react";
import './tale-gameshop-footer.css'

export default function TaleGameshopFooter() {
    return (
        <footer className="w-full bg-white py-8 px-8 border-t mt-auto">
            <div className="w-full flex justify-between items-center pb-4 border-b">
                <div className="text-4xl font-pacifico">
                    <span className="font-pacifico">Logo</span>
                </div>
                <nav className="flex space-x-8">
                    <a href="#" className="text-black hover:text-gray-600">Game Store</a>
                    <a href="#" className="text-black hover:text-gray-600">About Us</a>
                    <a href="#" className="text-black hover:text-gray-600">Contact Us</a>
                    <a href="#" className="text-black hover:text-gray-600">Help Centre</a>
                    <a href="#" className="text-black hover:text-gray-600">FAQs</a>
                </nav>
                <div className="flex space-x-4">
                    <a href="#" className="text-black hover:text-gray-600"><i className="fab fa-facebook-f"></i></a>
                    <a href="#" className="text-black hover:text-gray-600"><i className="fab fa-instagram"></i></a>
                    <a href="#" className="text-black hover:text-gray-600"><i className="fab fa-twitter"></i></a>
                    <a href="#" className="text-black hover:text-gray-600"><i className="fab fa-linkedin-in"></i></a>
                    <a href="#" className="text-black hover:text-gray-600"><i className="fab fa-youtube"></i></a>
                </div>
            </div>
            <div className="flex justify-between items-center pt-4">
                <span className="text-sm text-gray-600">© 2024 Relume. All rights reserved.</span>
                <div className="flex space-x-4 text-sm">
                    <a href="#" className="text-gray-600 hover:text-black">Privacy Policy</a>
                    <a href="#" className="text-gray-600 hover:text-black">Terms of Service</a>
                    <a href="#" className="text-gray-600 hover:text-black">Cookies Settings</a>
                </div>
            </div>
        </footer>
    );
}