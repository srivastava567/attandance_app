const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin, requireSuperAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard data
// @access  Private (Admin only)
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to current month if no dates provided
    const now = new Date();
    const startOfMonth = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get total users
    const totalUsers = await db('users').count('* as count').first();
    
    // Get active users
    const activeUsers = await db('users')
      .where('status', 'active')
      .count('* as count')
      .first();

    // Get today's attendance
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayAttendance = await db('attendance_records')
      .whereBetween('timestamp', [todayStart, todayEnd])
      .where('status', 'approved')
      .count('* as count')
      .first();

    // Get attendance by department
    const attendanceByDepartment = await db('attendance_records')
      .join('users', 'attendance_records.user_id', 'users.id')
      .whereBetween('attendance_records.timestamp', [startOfMonth, endOfMonth])
      .where('attendance_records.status', 'approved')
      .select('users.department')
      .count('attendance_records.id as count')
      .groupBy('users.department');

    // Get recent attendance records
    const recentAttendance = await db('attendance_records')
      .join('users', 'attendance_records.user_id', 'users.id')
      .select(
        'attendance_records.*',
        'users.first_name',
        'users.last_name',
        'users.employee_id',
        'users.department'
      )
      .orderBy('attendance_records.timestamp', 'desc')
      .limit(10);

    // Get flagged records
    const flaggedRecords = await db('attendance_records')
      .join('users', 'attendance_records.user_id', 'users.id')
      .where('attendance_records.status', 'flagged')
      .select(
        'attendance_records.*',
        'users.first_name',
        'users.last_name',
        'users.employee_id',
        'users.department'
      )
      .orderBy('attendance_records.timestamp', 'desc')
      .limit(5);

    // Get offline records pending sync
    const offlineRecords = await db('attendance_records')
      .where('is_offline', true)
      .whereNull('synced_at')
      .count('* as count')
      .first();

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers: parseInt(totalUsers.count),
          activeUsers: parseInt(activeUsers.count),
          todayAttendance: parseInt(todayAttendance.count),
          offlineRecords: parseInt(offlineRecords.count)
        },
        attendanceByDepartment,
        recentAttendance: recentAttendance.map(record => ({
          id: record.id,
          type: record.type,
          timestamp: record.timestamp,
          employeeName: `${record.first_name} ${record.last_name}`,
          employeeId: record.employee_id,
          department: record.department,
          status: record.status,
          location: {
            latitude: record.latitude,
            longitude: record.longitude,
            address: record.location_address
          }
        })),
        flaggedRecords: flaggedRecords.map(record => ({
          id: record.id,
          type: record.type,
          timestamp: record.timestamp,
          employeeName: `${record.first_name} ${record.last_name}`,
          employeeId: record.employee_id,
          department: record.department,
          rejectionReason: record.rejection_reason,
          location: {
            latitude: record.latitude,
            longitude: record.longitude,
            address: record.location_address
          }
        }))
      }
    });
  } catch (error) {
    logger.error('Get admin dashboard failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard data'
    });
  }
});

// @route   GET /api/admin/attendance
// @desc    Get all attendance records (Admin only)
// @access  Private
router.get('/attendance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      startDate, 
      endDate, 
      userId, 
      department, 
      status,
      type 
    } = req.query;
    
    const offset = (page - 1) * limit;

    let query = db('attendance_records')
      .join('users', 'attendance_records.user_id', 'users.id')
      .select(
        'attendance_records.*',
        'users.first_name',
        'users.last_name',
        'users.employee_id',
        'users.department'
      );

    // Apply filters
    if (startDate && endDate) {
      query = query.whereBetween('attendance_records.timestamp', [startDate, endDate]);
    }

    if (userId) {
      query = query.where('attendance_records.user_id', userId);
    }

    if (department) {
      query = query.where('users.department', department);
    }

    if (status) {
      query = query.where('attendance_records.status', status);
    }

    if (type) {
      query = query.where('attendance_records.type', type);
    }

    const records = await query
      .orderBy('attendance_records.timestamp', 'desc')
      .limit(limit)
      .offset(offset);

    const total = await db('attendance_records')
      .join('users', 'attendance_records.user_id', 'users.id')
      .count('* as count')
      .first();

    res.json({
      success: true,
      data: {
        records: records.map(record => ({
          id: record.id,
          type: record.type,
          timestamp: record.timestamp,
          employeeName: `${record.first_name} ${record.last_name}`,
          employeeId: record.employee_id,
          department: record.department,
          status: record.status,
          confidenceScore: record.confidence_score,
          livenessPassed: record.liveness_passed,
          location: {
            latitude: record.latitude,
            longitude: record.longitude,
            address: record.location_address,
            accuracy: record.accuracy
          },
          rejectionReason: record.rejection_reason,
          isOffline: record.is_offline,
          syncedAt: record.synced_at,
          createdAt: record.created_at
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Get admin attendance failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get attendance records'
    });
  }
});

// @route   PUT /api/admin/attendance/:id/approve
// @desc    Approve a flagged attendance record
// @access  Private (Admin only)
router.put('/attendance/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const record = await db('attendance_records')
      .where('id', id)
      .first();

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    await db('attendance_records')
      .where('id', id)
      .update({
        status: 'approved',
        approved_by: req.user.id,
        approved_at: new Date(),
        rejection_reason: null
      });

    // Log the action
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'attendance_approved',
      resource_type: 'attendance_record',
      resource_id: id,
      old_values: { status: record.status },
      new_values: { status: 'approved', reason },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'medium'
    });

    logger.info(`Attendance record ${id} approved by admin ${req.user.id}`);

    res.json({
      success: true,
      message: 'Attendance record approved successfully'
    });
  } catch (error) {
    logger.error('Approve attendance failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve attendance record'
    });
  }
});

// @route   PUT /api/admin/attendance/:id/reject
// @desc    Reject a flagged attendance record
// @access  Private (Admin only)
router.put('/attendance/:id/reject', authenticateToken, requireAdmin, [
  body('reason').notEmpty().withMessage('Rejection reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const record = await db('attendance_records')
      .where('id', id)
      .first();

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    await db('attendance_records')
      .where('id', id)
      .update({
        status: 'rejected',
        approved_by: req.user.id,
        approved_at: new Date(),
        rejection_reason: reason
      });

    // Log the action
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'attendance_rejected',
      resource_type: 'attendance_record',
      resource_id: id,
      old_values: { status: record.status },
      new_values: { status: 'rejected', reason },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'medium'
    });

    logger.info(`Attendance record ${id} rejected by admin ${req.user.id}`);

    res.json({
      success: true,
      message: 'Attendance record rejected successfully'
    });
  } catch (error) {
    logger.error('Reject attendance failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject attendance record'
    });
  }
});

// @route   GET /api/admin/audit-logs
// @desc    Get audit logs (Super Admin only)
// @access  Private
router.get('/audit-logs', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, action, severity, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    let query = db('audit_logs')
      .leftJoin('users', 'audit_logs.user_id', 'users.id')
      .select(
        'audit_logs.*',
        'users.first_name',
        'users.last_name',
        'users.employee_id'
      );

    // Apply filters
    if (userId) {
      query = query.where('audit_logs.user_id', userId);
    }

    if (action) {
      query = query.where('audit_logs.action', action);
    }

    if (severity) {
      query = query.where('audit_logs.severity', severity);
    }

    if (startDate && endDate) {
      query = query.whereBetween('audit_logs.created_at', [startDate, endDate]);
    }

    const logs = await query
      .orderBy('audit_logs.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const total = await db('audit_logs').count('* as count').first();

    res.json({
      success: true,
      data: {
        logs: logs.map(log => ({
          id: log.id,
          action: log.action,
          resourceType: log.resource_type,
          resourceId: log.resource_id,
          oldValues: log.old_values,
          newValues: log.new_values,
          ipAddress: log.ip_address,
          userAgent: log.user_agent,
          severity: log.severity,
          description: log.description,
          userName: log.first_name ? `${log.first_name} ${log.last_name}` : 'System',
          employeeId: log.employee_id,
          createdAt: log.created_at
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Get audit logs failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get audit logs'
    });
  }
});

// @route   POST /api/admin/work-schedules
// @desc    Create work schedule
// @access  Private (Admin only)
router.post('/work-schedules', authenticateToken, requireAdmin, [
  body('userId').isUUID().withMessage('Valid user ID is required'),
  body('scheduleName').notEmpty().withMessage('Schedule name is required'),
  body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid start time is required'),
  body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid end time is required'),
  body('workingDays').isArray().withMessage('Working days must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      userId,
      scheduleName,
      startTime,
      endTime,
      workingDays,
      latitude,
      longitude,
      locationRadius = 100,
      locationName,
      effectiveFrom,
      effectiveTo
    } = req.body;

    // Verify user exists
    const user = await db('users').where('id', userId).first();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const [schedule] = await db('work_schedules')
      .insert({
        user_id: userId,
        schedule_name: scheduleName,
        start_time: startTime,
        end_time: endTime,
        working_days: JSON.stringify(workingDays),
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        location_radius: locationRadius,
        location_name: locationName,
        effective_from: effectiveFrom ? new Date(effectiveFrom) : null,
        effective_to: effectiveTo ? new Date(effectiveTo) : null
      })
      .returning('*');

    // Log the action
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'work_schedule_created',
      resource_type: 'work_schedule',
      resource_id: schedule.id,
      new_values: {
        user_id: userId,
        schedule_name: scheduleName,
        start_time: startTime,
        end_time: endTime
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'low'
    });

    logger.info(`Work schedule created for user ${userId} by admin ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Work schedule created successfully',
      data: { schedule }
    });
  } catch (error) {
    logger.error('Create work schedule failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create work schedule'
    });
  }
});

module.exports = router;
