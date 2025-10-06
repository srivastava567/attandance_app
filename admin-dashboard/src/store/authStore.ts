import create from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'employee' | 'admin' | 'super_admin';

export interface User {
	id: string;
	employeeId: string;
	email: string;
	firstName: string;
	lastName: string;
	department?: string;
	position?: string;
	role: Role;
}

interface AuthState {
	user: User | null;
	token: string | null;
	refreshToken: string | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
	logout: () => void;
	setSession: (payload: { user: User; token: string; refreshToken: string }) => void;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set, get) => ({
			user: null,
			token: null,
			refreshToken: null,
			isAuthenticated: false,
			isLoading: false,
			async login(email, password) {
				set({ isLoading: true });
				try {
					const res = await fetch('/api/auth/login', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ email, password }),
					});
					const data = await res.json();
					if (!data.success) {
						set({ isLoading: false });
						return { success: false, message: data.message || 'Login failed' };
					}
					set({
						user: data.data.user,
						token: data.data.accessToken,
						refreshToken: data.data.refreshToken,
						isAuthenticated: true,
						isLoading: false,
					});
					return { success: true };
				} catch (e: any) {
					set({ isLoading: false });
					return { success: false, message: e?.message || 'Login error' };
				}
			},
			logout() {
				set({ user: null, token: null, refreshToken: null, isAuthenticated: false });
			},
			setSession(payload) {
				set({ user: payload.user, token: payload.token, refreshToken: payload.refreshToken, isAuthenticated: true });
			},
		}),
		{ name: 'admin-auth' }
	)
);


