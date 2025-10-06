import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({ baseURL: '/api', timeout: 30000 });

api.interceptors.request.use((config) => {
	const { token } = useAuthStore.getState();
	if (token) config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
	return config;
});

export const adminAPI = {
	getDashboard(params?: any) {
		return api.get('/admin/dashboard', { params }).then((r) => r.data);
	},
	getAttendance(params?: any) {
		return api.get('/admin/attendance', { params }).then((r) => r.data);
	},
	approveAttendance(id: string, reason?: string) {
		return api.put(`/admin/attendance/${id}/approve`, { reason }).then((r) => r.data);
	},
	rejectAttendance(id: string, reason: string) {
		return api.put(`/admin/attendance/${id}/reject`, { reason }).then((r) => r.data);
	},
	getUsers(params?: any) {
		return api.get('/users', { params }).then((r) => r.data);
	},
};

export const userAPI = {
	me() {
		return api.get('/auth/me').then((r) => r.data);
	},
	attendanceSummary(params?: any) {
		return api.get('/users/me/attendance-summary', { params }).then((r) => r.data);
	},
};

export default api;


