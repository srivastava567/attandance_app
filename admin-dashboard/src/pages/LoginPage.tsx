import React, { useState } from 'react';
import { Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const LoginPage: React.FC = () => {
	const navigate = useNavigate();
	const { login, isLoading } = useAuthStore();
	const [email, setEmail] = useState('admin@example.com');
	const [password, setPassword] = useState('password');
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		const res = await login(email, password);
		if (res.success) navigate('/dashboard');
		else setError(res.message || 'Login failed');
	};

	return (
		<Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh" sx={{ bgcolor: '#f5f5f5' }}>
			<Card sx={{ width: 380 }}>
				<CardContent>
					<Typography variant="h5" fontWeight="bold" gutterBottom>Admin Login</Typography>
					<form onSubmit={onSubmit}>
						<TextField fullWidth margin="normal" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
						<TextField fullWidth margin="normal" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
						{error && <Typography color="error" variant="body2" sx={{ mt: 1 }}>{error}</Typography>}
						<Button fullWidth variant="contained" type="submit" sx={{ mt: 2 }} disabled={isLoading}>Login</Button>
					</form>
				</CardContent>
			</Card>
		</Box>
	);
};

export default LoginPage;


