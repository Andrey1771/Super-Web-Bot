import { configureStore } from '@reduxjs/toolkit';

export interface Form { //TODO
    id: string,
    name: string,
    /** Цена в базовой валюте каталога. Валюту хранит сама игра, форма её не меняет. */
    price: number,
    /**
     * Ручные цены в остальных валютах: код → сумма. Пустое поле = в этой валюте не продаём,
     * и на витрине в ней игра просто не появится (см. CatalogPricing на сервере).
     */
    prices: Record<string, number>,
    description: string,
    title: string,
    gameType: number,
    imagePath: string,
    coverMediaId: string,
    releaseDate: string,
}

const initialState = {  form: {
        id: '',
        name: '',
        price: 0,
        prices: {},
        description: '',
        title: '',
        gameType: 0,
        imagePath: '',
        coverMediaId: '',
        releaseDate: '',
    } as Form };

function reducer(state = initialState, action: any) {
    switch (action.type) {
        case 'SET_GAME_TYPE_FORM': // Устанавливаем новое значение
            return { ...state, form: action.payload };
        default:
            return state;
    }
}

export const store = configureStore({
    reducer: reducer,
});
