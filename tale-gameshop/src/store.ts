import { configureStore } from '@reduxjs/toolkit';

export interface Form { //TODO
    id: string,
    name: string,
    price: number,
    description: string,
    title: string,
    gameType: number,
    imagePath: string,
    releaseDate: string,
}

const initialState = {  form: {
        id: '',
        name: '',
        price: 0,
        description: '',
        title: '',
        gameType: 0,
        imagePath: '',
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