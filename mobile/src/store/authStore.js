import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { userAPI, attendanceAPI } from '../services/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await userAPI.login(email, password);
          
          if (response.success) {
            const { user, accessToken, refreshToken } = response.data;
            
            set({
              user,
              token: accessToken,
              refreshToken,
              isAuthenticated: true,
              isLoading: false,
            });
            
            return { success: true };
          } else {
            set({ isLoading: false });
            return { success: false, message: response.message };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, message: error.message };
        }
      },

      register: async (userData) => {
        set({ isLoading: true });
        try {
          const response = await userAPI.register(userData);
          
          if (response.success) {
            set({ isLoading: false });
            return { success: true, message: 'Registration successful' };
          } else {
            set({ isLoading: false });
            return { success: false, message: response.message };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, message: error.message };
        }
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          return { success: false, message: 'No refresh token available' };
        }

        try {
          const response = await userAPI.refreshToken(refreshToken);
          
          if (response.success) {
            const { accessToken, refreshToken: newRefreshToken } = response.data;
            
            set({
              token: accessToken,
              refreshToken: newRefreshToken,
            });
            
            return { success: true };
          } else {
            // Refresh failed, logout user
            get().logout();
            return { success: false, message: 'Session expired' };
          }
        } catch (error) {
          get().logout();
          return { success: false, message: 'Session expired' };
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      updateProfile: async (profileData) => {
        set({ isLoading: true });
        try {
          const response = await userAPI.updateProfile(profileData);
          
          if (response.success) {
            set({ 
              user: { ...get().user, ...response.data.user },
              isLoading: false 
            });
            return { success: true, message: 'Profile updated successfully' };
          } else {
            set({ isLoading: false });
            return { success: false, message: response.message };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, message: error.message };
        }
      },

      changePassword: async (currentPassword, newPassword) => {
        set({ isLoading: true });
        try {
          const response = await userAPI.changePassword(currentPassword, newPassword);
          
          if (response.success) {
            set({ isLoading: false });
            return { success: true, message: 'Password changed successfully' };
          } else {
            set({ isLoading: false });
            return { success: false, message: response.message };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, message: error.message };
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export { useAuthStore };
