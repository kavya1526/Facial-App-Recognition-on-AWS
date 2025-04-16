import { configureStore } from '@reduxjs/toolkit';
import checkInsReducer from './checkInsSlice';

export const store = configureStore({
  reducer: {
    checkIns: checkInsReducer,
  },
});
