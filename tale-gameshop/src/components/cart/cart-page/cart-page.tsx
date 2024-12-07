import ProductCard from "../product-card/product-card";
import Cart from "../cart/cart";
import {CartProvider} from "../../../context/cart-context";
import React from "react";

export function CartPage() {
    return (
        <CartProvider>
            <div className="container mx-auto p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ProductCard id={1} name="Product 1" price={29.99} />
                    <ProductCard id={2} name="Product 2" price={49.99} />
                    <ProductCard id={3} name="Product 3" price={19.99} />
                </div>
                <Cart/>
            </div>
        </CartProvider>
    )
}