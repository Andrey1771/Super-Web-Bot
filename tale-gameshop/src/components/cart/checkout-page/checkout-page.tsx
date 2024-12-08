import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/cart-context';

const paymentMethods = [
    {
        id: 'credit_card',
        name: 'Credit Card',
        image: 'https://via.placeholder.com/100?text=Credit+Card',
    },
    {
        id: 'paypal',
        name: 'PayPal',
        image: 'https://via.placeholder.com/100?text=PayPal',
    },
    {
        id: 'cash_on_delivery',
        name: 'Cash on Delivery',
        image: 'https://via.placeholder.com/100?text=Cash',
    },
    {
        id: 'apple_pay',
        name: 'Apple Pay',
        image: 'https://via.placeholder.com/100?text=Apple+Pay',
    },
    {
        id: 'google_pay',
        name: 'Google Pay',
        image: 'https://via.placeholder.com/100?text=Google+Pay',
    },
];

const CheckoutPage: React.FC = () => {
    const { state } = useCart();
    const navigate = useNavigate();
    const [paymentMethod, setPaymentMethod] = useState<string>(paymentMethods[0].id);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const totalPrice = state.items.reduce((total, item) => total + item.price * item.quantity, 0);
    const carouselRef = useRef<HTMLDivElement>(null);

    const updateScrollButtons = () => {
        if (carouselRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
            setCanScrollLeft(scrollLeft > 0);
            setCanScrollRight(scrollLeft + clientWidth < scrollWidth);
        }
    };

    const scrollCarousel = (direction: 'left' | 'right') => {
        if (carouselRef.current) {
            const scrollAmount = 150; // Adjust scroll amount as needed
            carouselRef.current.scrollBy({
                left: direction === 'right' ? scrollAmount : -scrollAmount,
                behavior: 'smooth',
            });
        }
    };

    useEffect(() => {
        updateScrollButtons();
        const handleScroll = () => updateScrollButtons();
        const carousel = carouselRef.current;

        if (carousel) {
            carousel.addEventListener('scroll', handleScroll);
        }

        const resizeObserver = new ResizeObserver(() => {
            updateScrollButtons();
        });

        if (carousel) {
            resizeObserver.observe(carousel);
        }

        return () => {
            if (carousel) {
                carousel.removeEventListener('scroll', handleScroll);
                resizeObserver.disconnect();
            }
        };
    }, []);

    const handlePlaceOrder = () => {
        alert(`Order placed successfully with ${paymentMethod} payment method!`);
        navigate('/');
    };

    return (
        <div className="p-4 max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Checkout</h1>

            <h2 className="text-xl font-bold mb-4">Order Summary</h2>
            <div className="mb-6">
                {state.items.map((item) => (
                    <div
                        key={item.id}
                        className="flex justify-between items-center p-2 border-b"
                    >
                        <div className="flex items-center gap-4">
                            <img
                                src={`https://localhost:7117/${item.image}`}
                                alt={item.name}
                                className="w-16 h-16 object-cover rounded"
                            />
                            <span>{item.name}</span>
                        </div>
                        <span>{item.quantity} x ${item.price.toFixed(2)}</span>
                        <span>${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                ))}
                <div className="text-lg font-bold flex justify-between mt-4">
                    <span>Total:</span>
                    <span>${totalPrice.toFixed(2)}</span>
                </div>
            </div>

            <h2 className="text-xl font-bold mb-4">Payment Method</h2>
            <div className="relative flex items-center mb-6">
                {canScrollLeft && (
                    <button
                        onClick={() => scrollCarousel('left')}
                        className="absolute left-0 z-10 bg-gray-300 text-gray-800 px-3 py-1 rounded hover:bg-gray-400"
                    >
                        ◀
                    </button>
                )}
                <div
                    ref={carouselRef}
                    className="flex gap-4 overflow-x-hidden scrollbar-hide px-10"
                    style={{ scrollBehavior: 'smooth' }}
                >
                    {paymentMethods.map((method) => (
                        <div
                            key={method.id}
                            className={`flex flex-col items-center gap-2 cursor-pointer min-w-max ${
                                paymentMethod === method.id ? 'border-2 border-blue-500 rounded' : ''
                            }`}
                            onClick={() => setPaymentMethod(method.id)}
                        >
                            <img
                                src={method.image}
                                alt={method.name}
                                className="w-20 h-20 object-cover"
                            />
                            <span className="text-sm">{method.name}</span>
                        </div>
                    ))}
                </div>
                {canScrollRight && (
                    <button
                        onClick={() => scrollCarousel('right')}
                        className="absolute right-0 z-10 bg-gray-300 text-gray-800 px-3 py-1 rounded hover:bg-gray-400"
                    >
                        ▶
                    </button>
                )}
            </div>

            <button
                onClick={handlePlaceOrder}
                className="w-full px-4 py-2 bg-green-500 text-white font-bold rounded hover:bg-green-700"
            >
                Place Order
            </button>
        </div>
    );
};

export default CheckoutPage;
