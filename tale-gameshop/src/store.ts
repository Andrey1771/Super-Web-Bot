import { configureStore } from '@reduxjs/toolkit';
import { createStore } from 'redux';

const initialState = {  jwt: "0" };


function reducer(state = initialState, action: any) {
    switch (action.type) {
        case 'SET_JWT': // Устанавливаем новое значение jwt
            return { ...state, jwt: action.payload };
        default:
            return state;
    }
}

export const store = configureStore({
    reducer: reducer,
});