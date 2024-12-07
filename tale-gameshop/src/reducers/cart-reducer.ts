// src/reducers/cartReducer.ts
export interface Product {
    id: number;
    name: string;
    price: number;
    quantity: number;
}

export interface CartState {
    items: Product[];
}

export type CartAction =
    | { type: 'ADD_TO_CART'; payload: Product }
    | { type: 'REMOVE_FROM_CART'; payload: number }
    | { type: 'INCREASE_QUANTITY'; payload: number } // Новое действие
    | { type: 'DECREASE_QUANTITY'; payload: number } // Новое действие
    | { type: 'CLEAR_CART' };

export const initialState: CartState = {
    items: [],
};


export const cartReducer = (state: CartState, action: CartAction): CartState => {
    switch (action.type) {
        case 'ADD_TO_CART':
            const existingItem = state.items.find((item) => item.id === action.payload.id);
            if (existingItem) {
                return {
                    ...state,
                    items: state.items.map((item) =>
                        item.id === action.payload.id
                            ? { ...item, quantity: item.quantity + 1 }
                            : item
                    ),
                };
            }
            return { ...state, items: [...state.items, { ...action.payload, quantity: 1 }] };

        case 'REMOVE_FROM_CART':
            return {
                ...state,
                items: state.items.filter((item) => item.id !== action.payload),
            };

        case 'INCREASE_QUANTITY':
            return {
                ...state,
                items: state.items.map((item) =>
                    item.id === action.payload
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                ),
            };

        case 'DECREASE_QUANTITY':
            return {
                ...state,
                items: state.items
                    .map((item) =>
                        item.id === action.payload && item.quantity > 1
                            ? { ...item, quantity: item.quantity - 1 }
                            : item
                    )
                    .filter((item) => item.quantity > 0), // Удаляем товары с количеством 0
            };

        case 'CLEAR_CART':
            return { ...state, items: [] };

        default:
            return state;
    }
};