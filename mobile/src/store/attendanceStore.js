import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { attendanceAPI } from '../services/api';

const useAttendanceStore = create(
  persist(
    (set, get) => ({
      todayAttendance: {
        checkIn: null,
        checkOut: null,
        status: 'not_checked_in',
      },
      attendanceHistory: [],
      offlineRecords: [],
      isLoading: false,

      setTodayAttendance: (attendance) => {
        set({ todayAttendance: attendance });
      },

      setAttendanceHistory: (history) => {
        set({ attendanceHistory: history });
      },

      addOfflineRecord: (record) => {
        const { offlineRecords } = get();
        set({ offlineRecords: [...offlineRecords, record] });
      },

      removeOfflineRecord: (recordId) => {
        const { offlineRecords } = get();
        set({ 
          offlineRecords: offlineRecords.filter(record => record.id !== recordId) 
        });
      },

      clearOfflineRecords: () => {
        set({ offlineRecords: [] });
      },

      loadTodayAttendance: async () => {
        set({ isLoading: true });
        try {
          const response = await attendanceAPI.getTodayAttendance();
          
          if (response.success) {
            set({ 
              todayAttendance: response.data,
              isLoading: false 
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

      loadAttendanceHistory: async (params = {}) => {
        set({ isLoading: true });
        try {
          const response = await attendanceAPI.getAttendanceHistory(params);
          
          if (response.success) {
            set({ 
              attendanceHistory: response.data.records,
              isLoading: false 
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

      markAttendance: async (type, formData) => {
        set({ isLoading: true });
        try {
          const response = await attendanceAPI.markAttendance(type, formData);
          
          if (response.success) {
            // Reload today's attendance
            await get().loadTodayAttendance();
            
            set({ isLoading: false });
            return { success: true, message: 'Attendance marked successfully' };
          } else {
            set({ isLoading: false });
            return { success: false, message: response.message };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, message: error.message };
        }
      },

      syncOfflineRecords: async () => {
        const { offlineRecords } = get();
        if (offlineRecords.length === 0) {
          return { success: true, message: 'No offline records to sync' };
        }

        set({ isLoading: true });
        const results = [];
        
        try {
          for (const record of offlineRecords) {
            try {
              const formData = new FormData();
              formData.append('faceImage', {
                uri: record.photoUri,
                type: 'image/jpeg',
                name: 'face.jpg',
              });
              formData.append('latitude', record.latitude.toString());
              formData.append('longitude', record.longitude.toString());
              formData.append('accuracy', record.accuracy?.toString() || '');
              formData.append('locationAddress', record.locationAddress || '');
              formData.append('deviceInfo', record.deviceInfo);

              const response = await attendanceAPI.markAttendance(record.type, formData);
              
              if (response.success) {
                results.push({ id: record.id, success: true });
                get().removeOfflineRecord(record.id);
              } else {
                results.push({ id: record.id, success: false, error: response.message });
              }
            } catch (error) {
              results.push({ id: record.id, success: false, error: error.message });
            }
          }

          set({ isLoading: false });
          
          const successCount = results.filter(r => r.success).length;
          const totalCount = results.length;
          
          return { 
            success: true, 
            message: `Synced ${successCount}/${totalCount} records`,
            results 
          };
        } catch (error) {
          set({ isLoading: false });
          return { success: false, message: error.message };
        }
      },

      getAttendanceStats: () => {
        const { attendanceHistory } = get();
        
        const stats = {
          totalRecords: attendanceHistory.length,
          checkIns: attendanceHistory.filter(r => r.type === 'check_in').length,
          checkOuts: attendanceHistory.filter(r => r.type === 'check_out').length,
          approved: attendanceHistory.filter(r => r.status === 'approved').length,
          flagged: attendanceHistory.filter(r => r.status === 'flagged').length,
          rejected: attendanceHistory.filter(r => r.status === 'rejected').length,
        };

        return stats;
      },

      getMonthlyStats: (month, year) => {
        const { attendanceHistory } = get();
        
        const monthRecords = attendanceHistory.filter(record => {
          const recordDate = new Date(record.timestamp);
          return recordDate.getMonth() === month && recordDate.getFullYear() === year;
        });

        const dailyStats = {};
        
        monthRecords.forEach(record => {
          const date = record.timestamp.split('T')[0];
          if (!dailyStats[date]) {
            dailyStats[date] = { checkIn: null, checkOut: null };
          }
          
          if (record.type === 'check_in') {
            dailyStats[date].checkIn = record;
          } else if (record.type === 'check_out') {
            dailyStats[date].checkOut = record;
          }
        });

        const presentDays = Object.values(dailyStats).filter(day => 
          day.checkIn && day.checkOut
        ).length;

        const totalDays = Object.keys(dailyStats).length;
        const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

        return {
          presentDays,
          absentDays: totalDays - presentDays,
          attendanceRate,
          dailyStats,
        };
      },
    }),
    {
      name: 'attendance-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        todayAttendance: state.todayAttendance,
        offlineRecords: state.offlineRecords,
      }),
    }
  )
);

export { useAttendanceStore };
