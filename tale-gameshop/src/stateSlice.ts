import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AppState {
    message: string;
}

const initialState: AppState = {
    message: 'Initial message from Redux',
};

const stateSlice = createSlice({
    name: 'state',
    initialState,
    reducers: {
        updateMessage: (state, action: PayloadAction<string>) => {
            state.message = action.payload;
        },
    },
});

export const { updateMessage } = stateSlice.actions;
export default stateSlice.reducer;