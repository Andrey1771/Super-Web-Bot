import React from "react";
import './game-item.css'

export default function AboutUs() {
    //https://localhost:7117/api/Game


return (
    <div className="bg-white p-4 rounded-lg shadow">
        <img alt="Action Game 1" className="mb-4" height="100"
             src="https://storage.googleapis.com/a1aa/image/Lno92rIOY6LLO9k6Bcv7O4ztQuA03J89i3Jfe2d5e0uhH6WnA.jpg"
             width="100"/>
        <h2 className="text-xl font-bold mb-2">
            Action Game Title 1
        </h2>
        <p className="text-gray-600 mb-4">
            $29.99
        </p>
        <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
            Add to Cart
        </button>
    </div>
);
}