import React from 'react';
import { AppBar, Box, Toolbar, Typography, IconButton, Drawer, List, ListItemButton, ListItemText } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const menu = [
	{ label: 'Dashboard', path: '/dashboard' },
	{ label: 'Attendance', path: '/attendance' },
	{ label: 'Users', path: '/users' },
	{ label: 'Analytics', path: '/analytics' },
	{ label: 'Settings', path: '/settings' },
	{ label: 'Profile', path: '/profile' },
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [open, setOpen] = React.useState(false);
	const navigate = useNavigate();
	const location = useLocation();
	const { logout } = useAuthStore();

	return (
		<Box>
			<AppBar position="fixed">
				<Toolbar>
					<IconButton color="inherit" edge="start" onClick={() => setOpen(true)}>
						<MenuIcon />
					</IconButton>
					<Typography variant="h6" sx={{ flexGrow: 1 }}>Attendance Admin</Typography>
					<IconButton color="inherit" onClick={() => { logout(); navigate('/login'); }}>Logout</IconButton>
				</Toolbar>
			</AppBar>
			<Toolbar />
			<Drawer open={open} onClose={() => setOpen(false)}>
				<Box sx={{ width: 250 }} role="presentation" onClick={() => setOpen(false)}>
					<List>
						{menu.map((m) => (
							<ListItemButton key={m.path} selected={location.pathname === m.path} onClick={() => navigate(m.path)}>
								<ListItemText primary={m.label} />
							</ListItemButton>
						))}
					</List>
				</Box>
			</Drawer>
			<Box component="main" sx={{ p: 3 }}>{children}</Box>
		</Box>
	);
};

export default Layout;


