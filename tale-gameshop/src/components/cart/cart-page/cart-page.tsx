import Cart from "../cart/cart";
import React from "react";

export function CartPage() {
    return (
        <div className="relative overflow-hidden">
            <div className="pointer-events-none absolute -left-40 -top-24 h-80 w-80 rounded-full bg-purple-200/40 blur-3xl"></div>
            <div className="pointer-events-none absolute -right-32 top-10 h-72 w-72 rounded-full bg-purple-300/30 blur-3xl"></div>
            <div className="pointer-events-none absolute left-1/3 bottom-10 h-60 w-60 rounded-full bg-indigo-200/40 blur-3xl"></div>
            <div className="container mx-auto px-4 py-12 relative">
                <Cart/>
            </div>
        </div>
    )
}
