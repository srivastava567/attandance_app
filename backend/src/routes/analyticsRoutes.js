const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// @route   GET /api/analytics/attendance-trends
// @desc    Get attendance trends and analytics
// @access  Private (Admin only)
router.get('/attendance-trends', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, department, userId } = req.query;
    
    // Default to last 30 days if no dates provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    let query = db('attendance_records')
      .join('users', 'attendance_records.user_id', 'users.id')
      .whereBetween('attendance_records.timestamp', [start, end])
      .where('attendance_records.status', 'approved');

    if (department) {
      query = query.where('users.department', department);
    }

    if (userId) {
      query = query.where('attendance_records.user_id', userId);
    }

    const records = await query
      .select(
        'attendance_records.timestamp',
        'attendance_records.type',
        'users.department',
        'users.id as user_id'
      )
      .orderBy('attendance_records.timestamp', 'asc');

    // Process data for trends
    const dailyData = {};
    const hourlyData = {};
    const departmentData = {};
    const userData = {};

    records.forEach(record => {
      const date = record.timestamp.toISOString().split('T')[0];
      const hour = record.timestamp.getHours();
      
      // Daily trends
      if (!dailyData[date]) {
        dailyData[date] = { checkIns: 0, checkOuts: 0 };
      }
      dailyData[date][record.type === 'check_in' ? 'checkIns' : 'checkOuts']++;

      // Hourly trends
      if (!hourlyData[hour]) {
        hourlyData[hour] = { checkIns: 0, checkOuts: 0 };
      }
      hourlyData[hour][record.type === 'check_in' ? 'checkIns' : 'checkOuts']++;

      // Department trends
      if (!departmentData[record.department]) {
        departmentData[record.department] = { checkIns: 0, checkOuts: 0 };
      }
      departmentData[record.department][record.type === 'check_in' ? 'checkIns' : 'checkOuts']++;

      // User trends
      if (!userData[record.user_id]) {
        userData[record.user_id] = { checkIns: 0, checkOuts: 0 };
      }
      userData[record.user_id][record.type === 'check_in' ? 'checkIns' : 'checkOuts']++;
    });

    // Convert to arrays for charts
    const dailyTrends = Object.keys(dailyData).map(date => ({
      date,
      checkIns: dailyData[date].checkIns,
      checkOuts: dailyData[date].checkOuts
    }));

    const hourlyTrends = Object.keys(hourlyData).map(hour => ({
      hour: parseInt(hour),
      checkIns: hourlyData[hour].checkIns,
      checkOuts: hourlyData[hour].checkOuts
    }));

    const departmentTrends = Object.keys(departmentData).map(dept => ({
      department: dept,
      checkIns: departmentData[dept].checkIns,
      checkOuts: departmentData[dept].checkOuts
    }));

    res.json({
      success: true,
      data: {
        dailyTrends,
        hourlyTrends,
        departmentTrends,
        summary: {
          totalCheckIns: records.filter(r => r.type === 'check_in').length,
          totalCheckOuts: records.filter(r => r.type === 'check_out').length,
          uniqueUsers: Object.keys(userData).length,
          dateRange: { start, end }
        }
      }
    });
  } catch (error) {
    logger.error('Get attendance trends failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get attendance trends'
    });
  }
});

// @route   GET /api/analytics/employee-performance
// @desc    Get employee performance analytics
// @access  Private (Admin only)
router.get('/employee-performance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;
    
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    let query = db('users')
      .leftJoin('attendance_records', function() {
        this.on('users.id', '=', 'attendance_records.user_id')
          .andOn('attendance_records.timestamp', 'between', [start, end])
          .andOn('attendance_records.status', '=', 'approved');
      })
      .select(
        'users.id',
        'users.employee_id',
        'users.first_name',
        'users.last_name',
        'users.department',
        'users.position'
      );

    if (department) {
      query = query.where('users.department', department);
    }

    const users = await query;

    // Get detailed attendance for each user
    const performanceData = await Promise.all(users.map(async (user) => {
      const attendanceRecords = await db('attendance_records')
        .where('user_id', user.id)
        .whereBetween('timestamp', [start, end])
        .where('status', 'approved')
        .orderBy('timestamp', 'asc');

      // Calculate performance metrics
      const dailyRecords = {};
      let totalHours = 0;
      let presentDays = 0;
      let lateArrivals = 0;
      let earlyDepartures = 0;
      let totalDays = 0;

      // Calculate total working days in the period
      const workingDays = calculateWorkingDays(start, end);

      attendanceRecords.forEach(record => {
        const date = record.timestamp.toISOString().split('T')[0];
        
        if (!dailyRecords[date]) {
          dailyRecords[date] = { checkIn: null, checkOut: null };
        }
        
        if (record.type === 'check_in') {
          dailyRecords[date].checkIn = record;
        } else if (record.type === 'check_out') {
          dailyRecords[date].checkOut = record;
        }
      });

      Object.keys(dailyRecords).forEach(date => {
        const dayRecords = dailyRecords[date];
        totalDays++;
        
        if (dayRecords.checkIn && dayRecords.checkOut) {
          presentDays++;
          
          const hours = (dayRecords.checkOut.timestamp - dayRecords.checkIn.timestamp) / (1000 * 60 * 60);
          totalHours += hours;
          
          // Check for late arrival (assuming 9 AM start time)
          const checkInTime = new Date(dayRecords.checkIn.timestamp);
          const expectedStartTime = new Date(checkInTime);
          expectedStartTime.setHours(9, 0, 0, 0);
          
          if (checkInTime > expectedStartTime) {
            lateArrivals++;
          }
          
          // Check for early departure (assuming 5 PM end time)
          const checkOutTime = new Date(dayRecords.checkOut.timestamp);
          const expectedEndTime = new Date(checkOutTime);
          expectedEndTime.setHours(17, 0, 0, 0);
          
          if (checkOutTime < expectedEndTime) {
            earlyDepartures++;
          }
        }
      });

      const attendanceRate = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;
      const averageHours = presentDays > 0 ? totalHours / presentDays : 0;
      const punctualityRate = presentDays > 0 ? ((presentDays - lateArrivals) / presentDays) * 100 : 0;

      return {
        userId: user.id,
        employeeId: user.employee_id,
        name: `${user.first_name} ${user.last_name}`,
        department: user.department,
        position: user.position,
        metrics: {
          attendanceRate: Math.round(attendanceRate * 100) / 100,
          averageHours: Math.round(averageHours * 100) / 100,
          punctualityRate: Math.round(punctualityRate * 100) / 100,
          totalHours: Math.round(totalHours * 100) / 100,
          presentDays,
          absentDays: workingDays - presentDays,
          lateArrivals,
          earlyDepartures
        }
      };
    }));

    // Sort by attendance rate
    performanceData.sort((a, b) => b.metrics.attendanceRate - a.metrics.attendanceRate);

    res.json({
      success: true,
      data: {
        performanceData,
        summary: {
          totalEmployees: performanceData.length,
          averageAttendanceRate: performanceData.reduce((sum, emp) => sum + emp.metrics.attendanceRate, 0) / performanceData.length,
          averageHours: performanceData.reduce((sum, emp) => sum + emp.metrics.averageHours, 0) / performanceData.length,
          dateRange: { start, end }
        }
      }
    });
  } catch (error) {
    logger.error('Get employee performance failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get employee performance data'
    });
  }
});

// @route   GET /api/analytics/location-insights
// @desc    Get location-based insights
// @access  Private (Admin only)
router.get('/location-insights', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;
    
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    let query = db('attendance_records')
      .join('users', 'attendance_records.user_id', 'users.id')
      .whereBetween('attendance_records.timestamp', [start, end])
      .where('attendance_records.status', 'approved')
      .whereNotNull('attendance_records.latitude')
      .whereNotNull('attendance_records.longitude');

    if (department) {
      query = query.where('users.department', department);
    }

    const records = await query
      .select(
        'attendance_records.latitude',
        'attendance_records.longitude',
        'attendance_records.location_address',
        'attendance_records.type',
        'attendance_records.timestamp',
        'users.department',
        'users.first_name',
        'users.last_name',
        'users.employee_id'
      )
      .orderBy('attendance_records.timestamp', 'desc');

    // Group by location
    const locationData = {};
    const departmentLocations = {};

    records.forEach(record => {
      const locationKey = `${record.latitude},${record.longitude}`;
      
      if (!locationData[locationKey]) {
        locationData[locationKey] = {
          latitude: record.latitude,
          longitude: record.longitude,
          address: record.location_address,
          checkIns: 0,
          checkOuts: 0,
          uniqueUsers: new Set(),
          departments: new Set()
        };
      }
      
      locationData[locationKey][record.type === 'check_in' ? 'checkIns' : 'checkOuts']++;
      locationData[locationKey].uniqueUsers.add(record.user_id);
      locationData[locationKey].departments.add(record.department);

      // Department-specific locations
      if (!departmentLocations[record.department]) {
        departmentLocations[record.department] = {};
      }
      
      if (!departmentLocations[record.department][locationKey]) {
        departmentLocations[record.department][locationKey] = {
          latitude: record.latitude,
          longitude: record.longitude,
          address: record.location_address,
          checkIns: 0,
          checkOuts: 0,
          uniqueUsers: new Set()
        };
      }
      
      departmentLocations[record.department][locationKey][record.type === 'check_in' ? 'checkIns' : 'checkOuts']++;
      departmentLocations[record.department][locationKey].uniqueUsers.add(record.user_id);
    });

    // Convert to arrays
    const locations = Object.keys(locationData).map(key => ({
      ...locationData[key],
      uniqueUsers: locationData[key].uniqueUsers.size,
      departments: Array.from(locationData[key].departments),
      totalActivity: locationData[key].checkIns + locationData[key].checkOuts
    }));

    const departmentLocationsArray = Object.keys(departmentLocations).map(dept => ({
      department: dept,
      locations: Object.keys(departmentLocations[dept]).map(key => ({
        ...departmentLocations[dept][key],
        uniqueUsers: departmentLocations[dept][key].uniqueUsers.size,
        totalActivity: departmentLocations[dept][key].checkIns + departmentLocations[dept][key].checkOuts
      }))
    }));

    res.json({
      success: true,
      data: {
        locations: locations.sort((a, b) => b.totalActivity - a.totalActivity),
        departmentLocations: departmentLocationsArray,
        summary: {
          totalLocations: locations.length,
          totalRecords: records.length,
          dateRange: { start, end }
        }
      }
    });
  } catch (error) {
    logger.error('Get location insights failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get location insights'
    });
  }
});

// Helper function to calculate working days
function calculateWorkingDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    // Count weekdays (Monday = 1 to Friday = 5)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

module.exports = router;
