import axios from 'axios';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';

// Base API configuration
const API_BASE_URL = 'http://localhost:3000/api'; // Replace with your actual API URL

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config) => {
    const { token, refreshAccessToken } = useAuthStore.getState();
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const { refreshAccessToken } = useAuthStore.getState();
        const refreshResult = await refreshAccessToken();
        
        if (refreshResult.success) {
          const { token } = useAuthStore.getState();
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        } else {
          // Refresh failed, logout user
          const { logout } = useAuthStore.getState();
          logout();
          return Promise.reject(error);
        }
      } catch (refreshError) {
        const { logout } = useAuthStore.getState();
        logout();
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

// Network status check
const isOnline = async () => {
  const netInfo = await NetInfo.fetch();
  return netInfo.isConnected;
};

// API Services
export const authAPI = {
  login: async (email, password) => {
    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  },

  register: async (userData) => {
    try {
      const response = await apiClient.post('/auth/register', userData);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Registration failed');
    }
  },

  refreshToken: async (refreshToken) => {
    try {
      const response = await apiClient.post('/auth/refresh', {
        refreshToken,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Token refresh failed');
    }
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
      return { success: true };
    } catch (error) {
      // Even if logout fails on server, we should still clear local data
      return { success: true };
    }
  },

  getProfile: async () => {
    try {
      const response = await apiClient.get('/auth/me');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get profile');
    }
  },
};

export const userAPI = {
  ...authAPI,

  updateProfile: async (profileData) => {
    try {
      const response = await apiClient.put('/users/me', profileData);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Profile update failed');
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    try {
      const response = await apiClient.put('/users/me/password', {
        currentPassword,
        newPassword,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Password change failed');
    }
  },

  getAttendanceSummary: async (params = {}) => {
    try {
      const response = await apiClient.get('/users/me/attendance-summary', {
        params,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get attendance summary');
    }
  },
};

export const attendanceAPI = {
  markAttendance: async (type, formData) => {
    try {
      const endpoint = type === 'check_in' ? '/attendance/check-in' : '/attendance/check-out';
      const response = await apiClient.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Attendance marking failed');
    }
  },

  getTodayAttendance: async () => {
    try {
      const response = await apiClient.get('/attendance/today');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get today attendance');
    }
  },

  getAttendanceHistory: async (params = {}) => {
    try {
      const response = await apiClient.get('/attendance/history', {
        params,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get attendance history');
    }
  },

  syncOfflineAttendance: async (offlineRecords) => {
    try {
      const response = await apiClient.post('/attendance/sync-offline', {
        records: offlineRecords,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Offline sync failed');
    }
  },
};

export const faceRecognitionAPI = {
  registerFace: async (userId, formData) => {
    try {
      const response = await apiClient.post('/face-recognition/register', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        params: { userId },
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Face registration failed');
    }
  },

  verifyFace: async (formData) => {
    try {
      const response = await apiClient.post('/face-recognition/verify', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Face verification failed');
    }
  },

  getFaceTemplates: async (userId) => {
    try {
      const response = await apiClient.get(`/face-recognition/templates/${userId}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get face templates');
    }
  },

  deleteFaceTemplate: async (templateId) => {
    try {
      const response = await apiClient.delete(`/face-recognition/templates/${templateId}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to delete face template');
    }
  },
};

export const adminAPI = {
  getDashboard: async () => {
    try {
      const response = await apiClient.get('/admin/dashboard');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get dashboard data');
    }
  },

  getAttendanceRecords: async (params = {}) => {
    try {
      const response = await apiClient.get('/admin/attendance', {
        params,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get attendance records');
    }
  },

  approveAttendance: async (recordId, reason) => {
    try {
      const response = await apiClient.put(`/admin/attendance/${recordId}/approve`, {
        reason,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to approve attendance');
    }
  },

  rejectAttendance: async (recordId, reason) => {
    try {
      const response = await apiClient.put(`/admin/attendance/${recordId}/reject`, {
        reason,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to reject attendance');
    }
  },

  getUsers: async (params = {}) => {
    try {
      const response = await apiClient.get('/users', {
        params,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get users');
    }
  },

  updateUserStatus: async (userId, status, reason) => {
    try {
      const response = await apiClient.put(`/users/${userId}/status`, {
        status,
        reason,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to update user status');
    }
  },
};

export const analyticsAPI = {
  getAttendanceTrends: async (params = {}) => {
    try {
      const response = await apiClient.get('/analytics/attendance-trends', {
        params,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get attendance trends');
    }
  },

  getEmployeePerformance: async (params = {}) => {
    try {
      const response = await apiClient.get('/analytics/employee-performance', {
        params,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get employee performance');
    }
  },

  getLocationInsights: async (params = {}) => {
    try {
      const response = await apiClient.get('/analytics/location-insights', {
        params,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get location insights');
    }
  },
};

// Utility functions
export const apiUtils = {
  isOnline,
  
  handleApiError: (error) => {
    if (error.response) {
      // Server responded with error status
      return {
        message: error.response.data?.message || 'Server error occurred',
        status: error.response.status,
        data: error.response.data,
      };
    } else if (error.request) {
      // Request was made but no response received
      return {
        message: 'Network error - please check your connection',
        status: 0,
        data: null,
      };
    } else {
      // Something else happened
      return {
        message: error.message || 'An unexpected error occurred',
        status: -1,
        data: null,
      };
    }
  },

  retryRequest: async (requestFn, maxRetries = 3, delay = 1000) => {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }
    
    throw lastError;
  },
};

export default apiClient;
