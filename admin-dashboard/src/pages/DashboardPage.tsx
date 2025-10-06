import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  TrendingUp,
  People,
  Schedule,
  LocationOn,
  Warning,
  CheckCircle,
  Cancel,
  Refresh,
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import toast from 'react-hot-toast';

import { useAuthStore } from '../store/authStore';
import { adminAPI } from '../services/api';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import LoadingSpinner from '../components/LoadingSpinner';
import AttendanceTable from '../components/AttendanceTable';
import RecentActivity from '../components/RecentActivity';

const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState({
    startDate: subDays(new Date(), 30),
    endDate: new Date(),
  });

  // Fetch dashboard data
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useQuery(
    ['dashboard', dateRange],
    () => adminAPI.getDashboard({
      startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
      endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
    }),
    {
      refetchInterval: 30000, // Refetch every 30 seconds
    }
  );

  // Fetch attendance trends
  const {
    data: trendsData,
    isLoading: trendsLoading,
  } = useQuery(
    ['attendance-trends', dateRange],
    () => adminAPI.getAttendanceTrends({
      startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
      endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
    })
  );

  // Approve attendance mutation
  const approveMutation = useMutation(
    ({ recordId, reason }: { recordId: string; reason?: string }) =>
      adminAPI.approveAttendance(recordId, reason),
    {
      onSuccess: () => {
        toast.success('Attendance approved successfully');
        queryClient.invalidateQueries(['dashboard']);
        queryClient.invalidateQueries(['attendance']);
      },
      onError: (error: any) => {
        toast.error(error.message || 'Failed to approve attendance');
      },
    }
  );

  // Reject attendance mutation
  const rejectMutation = useMutation(
    ({ recordId, reason }: { recordId: string; reason: string }) =>
      adminAPI.rejectAttendance(recordId, reason),
    {
      onSuccess: () => {
        toast.success('Attendance rejected successfully');
        queryClient.invalidateQueries(['dashboard']);
        queryClient.invalidateQueries(['attendance']);
      },
      onError: (error: any) => {
        toast.error(error.message || 'Failed to reject attendance');
      },
    }
  );

  const handleApprove = (recordId: string, reason?: string) => {
    approveMutation.mutate({ recordId, reason });
  };

  const handleReject = (recordId: string, reason: string) => {
    rejectMutation.mutate({ recordId, reason });
  };

  const handleRefresh = () => {
    refetchDashboard();
    queryClient.invalidateQueries(['attendance-trends']);
  };

  if (dashboardLoading) {
    return <LoadingSpinner />;
  }

  if (dashboardError) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load dashboard data. Please try again.
      </Alert>
    );
  }

  const { overview, attendanceByDepartment, recentAttendance, flaggedRecords } = dashboardData?.data || {};

  // Prepare chart data
  const attendanceTrendData = trendsData?.data?.dailyTrends?.map((item: any) => ({
    date: format(new Date(item.date), 'MMM dd'),
    checkIns: item.checkIns,
    checkOuts: item.checkOuts,
  })) || [];

  const departmentData = attendanceByDepartment?.map((dept: any) => ({
    name: dept.department,
    attendance: dept.count,
  })) || [];

  const COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336'];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Dashboard
        </Typography>
        <Tooltip title="Refresh Data">
          <IconButton onClick={handleRefresh} disabled={dashboardLoading}>
            <Refresh />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="h6">
                    Total Users
                  </Typography>
                  <Typography variant="h4" component="div" fontWeight="bold">
                    {overview?.totalUsers || 0}
                  </Typography>
                </Box>
                <People sx={{ fontSize: 40, color: 'primary.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="h6">
                    Active Users
                  </Typography>
                  <Typography variant="h4" component="div" fontWeight="bold">
                    {overview?.activeUsers || 0}
                  </Typography>
                </Box>
                <CheckCircle sx={{ fontSize: 40, color: 'success.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="h6">
                    Today's Attendance
                  </Typography>
                  <Typography variant="h4" component="div" fontWeight="bold">
                    {overview?.todayAttendance || 0}
                  </Typography>
                </Box>
                <Schedule sx={{ fontSize: 40, color: 'info.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="h6">
                    Offline Records
                  </Typography>
                  <Typography variant="h4" component="div" fontWeight="bold">
                    {overview?.offlineRecords || 0}
                  </Typography>
                </Box>
                <Warning sx={{ fontSize: 40, color: 'warning.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Attendance Trends */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Attendance Trends (Last 30 Days)
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={attendanceTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <RechartsTooltip />
                    <Line
                      type="monotone"
                      dataKey="checkIns"
                      stroke="#4CAF50"
                      strokeWidth={2}
                      name="Check Ins"
                    />
                    <Line
                      type="monotone"
                      dataKey="checkOuts"
                      stroke="#2196F3"
                      strokeWidth={2}
                      name="Check Outs"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Department Distribution */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Attendance by Department
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={departmentData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="attendance"
                    >
                      {departmentData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Activity and Flagged Records */}
      <Grid container spacing={3}>
        {/* Recent Activity */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Attendance Activity
              </Typography>
              <RecentActivity
                activities={recentAttendance || []}
                onApprove={handleApprove}
                onReject={handleReject}
                loading={approveMutation.isLoading || rejectMutation.isLoading}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Flagged Records */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Flagged Records
              </Typography>
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                {flaggedRecords?.length > 0 ? (
                  flaggedRecords.map((record: any) => (
                    <Box
                      key={record.id}
                      sx={{
                        p: 2,
                        mb: 1,
                        border: '1px solid',
                        borderColor: 'warning.main',
                        borderRadius: 1,
                        backgroundColor: 'warning.light',
                      }}
                    >
                      <Typography variant="subtitle2" fontWeight="bold">
                        {record.employeeName}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {record.employeeId} • {record.department}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        {record.rejectionReason}
                      </Typography>
                      <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                        <Chip
                          label="Approve"
                          size="small"
                          color="success"
                          onClick={() => handleApprove(record.id)}
                          disabled={approveMutation.isLoading}
                        />
                        <Chip
                          label="Reject"
                          size="small"
                          color="error"
                          onClick={() => {
                            const reason = prompt('Rejection reason:');
                            if (reason) handleReject(record.id, reason);
                          }}
                          disabled={rejectMutation.isLoading}
                        />
                      </Box>
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center', py: 2 }}>
                    No flagged records
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
