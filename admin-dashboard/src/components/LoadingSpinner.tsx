import React from 'react';
import { Box, CircularProgress } from '@mui/material';

const LoadingSpinner: React.FC<{ size?: 'small' | 'medium' | 'large' }> = ({ size = 'medium' }) => {
	const px = size === 'small' ? 24 : size === 'large' ? 56 : 40;
	return (
		<Box display="flex" justifyContent="center" alignItems="center" p={2}>
			<CircularProgress size={px} />
		</Box>
	);
};

export default LoadingSpinner;


