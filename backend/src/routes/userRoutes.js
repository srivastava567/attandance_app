const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin, requireSuperAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users (Admin only)
// @access  Private
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, department, status } = req.query;
    const offset = (page - 1) * limit;

    let query = db('users')
      .select('id', 'employee_id', 'email', 'first_name', 'last_name', 'department', 'position', 'role', 'status', 'is_verified', 'last_login', 'created_at');

    // Apply filters
    if (search) {
      query = query.where(function() {
        this.where('first_name', 'ilike', `%${search}%`)
          .orWhere('last_name', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`)
          .orWhere('employee_id', 'ilike', `%${search}%`);
      });
    }

    if (department) {
      query = query.where('department', department);
    }

    if (status) {
      query = query.where('status', status);
    }

    const users = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const total = await db('users').count('* as count').first();

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Get users failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users'
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Users can only view their own profile unless they're admin
    if (id !== userId && userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await db('users')
      .select('id', 'employee_id', 'email', 'first_name', 'last_name', 'department', 'position', 'role', 'status', 'is_verified', 'last_login', 'created_at')
      .where('id', id)
      .first();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    logger.error('Get user failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user'
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private
router.put('/:id', authenticateToken, [
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('department').optional().notEmpty().withMessage('Department cannot be empty'),
  body('position').optional().notEmpty().withMessage('Position cannot be empty'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number')
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
    const userId = req.user.id;
    const userRole = req.user.role;

    // Users can only update their own profile unless they're admin
    if (id !== userId && userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const {
      firstName,
      lastName,
      department,
      position,
      phone
    } = req.body;

    const updateData = {};
    if (firstName) updateData.first_name = firstName;
    if (lastName) updateData.last_name = lastName;
    if (department) updateData.department = department;
    if (position) updateData.position = position;
    if (phone) updateData.phone = phone;

    updateData.updated_at = new Date();

    const [updatedUser] = await db('users')
      .where('id', id)
      .update(updateData)
      .returning(['id', 'employee_id', 'email', 'first_name', 'last_name', 'department', 'position', 'role', 'status']);

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log the action
    await db('audit_logs').insert({
      user_id: userId,
      action: 'user_updated',
      resource_type: 'user',
      resource_id: id,
      new_values: updateData,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'low'
    });

    logger.info(`User ${id} updated by ${userId}`);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    logger.error('Update user failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// @route   PUT /api/users/:id/status
// @desc    Update user status (Admin only)
// @access  Private
router.put('/:id/status', authenticateToken, requireAdmin, [
  body('status').isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
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
    const { status, reason } = req.body;

    const user = await db('users')
      .where('id', id)
      .first();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const oldStatus = user.status;

    await db('users')
      .where('id', id)
      .update({
        status,
        updated_at: new Date()
      });

    // Log the action
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'user_status_changed',
      resource_type: 'user',
      resource_id: id,
      old_values: { status: oldStatus },
      new_values: { status, reason },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'medium'
    });

    logger.info(`User ${id} status changed from ${oldStatus} to ${status} by ${req.user.id}`);

    res.json({
      success: true,
      message: 'User status updated successfully'
    });
  } catch (error) {
    logger.error('Update user status failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
});

// @route   GET /api/users/:id/attendance-summary
// @desc    Get user's attendance summary
// @access  Private
router.get('/:id/attendance-summary', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Users can only view their own attendance unless they're admin
    if (id !== userId && userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { startDate, endDate } = req.query;
    
    let query = db('attendance_records')
      .where('user_id', id)
      .where('status', 'approved');

    if (startDate && endDate) {
      query = query.whereBetween('timestamp', [startDate, endDate]);
    } else {
      // Default to current month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      query = query.whereBetween('timestamp', [startOfMonth, endOfMonth]);
    }

    const records = await query.orderBy('timestamp', 'asc');

    // Calculate summary statistics
    const summary = {
      totalDays: 0,
      presentDays: 0,
      absentDays: 0,
      totalHours: 0,
      averageHours: 0,
      checkIns: 0,
      checkOuts: 0,
      lateArrivals: 0,
      earlyDepartures: 0
    };

    const dailyRecords = {};
    
    records.forEach(record => {
      const date = record.timestamp.toISOString().split('T')[0];
      
      if (!dailyRecords[date]) {
        dailyRecords[date] = { checkIn: null, checkOut: null };
      }
      
      if (record.type === 'check_in') {
        dailyRecords[date].checkIn = record;
        summary.checkIns++;
      } else if (record.type === 'check_out') {
        dailyRecords[date].checkOut = record;
        summary.checkOuts++;
      }
    });

    // Calculate daily statistics
    Object.keys(dailyRecords).forEach(date => {
      const dayRecords = dailyRecords[date];
      summary.totalDays++;
      
      if (dayRecords.checkIn && dayRecords.checkOut) {
        summary.presentDays++;
        
        const hours = (dayRecords.checkOut.timestamp - dayRecords.checkIn.timestamp) / (1000 * 60 * 60);
        summary.totalHours += hours;
        
        // Check for late arrival (assuming 9 AM start time)
        const checkInTime = new Date(dayRecords.checkIn.timestamp);
        const expectedStartTime = new Date(checkInTime);
        expectedStartTime.setHours(9, 0, 0, 0);
        
        if (checkInTime > expectedStartTime) {
          summary.lateArrivals++;
        }
        
        // Check for early departure (assuming 5 PM end time)
        const checkOutTime = new Date(dayRecords.checkOut.timestamp);
        const expectedEndTime = new Date(checkOutTime);
        expectedEndTime.setHours(17, 0, 0, 0);
        
        if (checkOutTime < expectedEndTime) {
          summary.earlyDepartures++;
        }
      } else {
        summary.absentDays++;
      }
    });

    summary.averageHours = summary.presentDays > 0 ? summary.totalHours / summary.presentDays : 0;

    res.json({
      success: true,
      data: {
        summary,
        dailyRecords: Object.keys(dailyRecords).map(date => ({
          date,
          checkIn: dailyRecords[date].checkIn,
          checkOut: dailyRecords[date].checkOut,
          hours: dailyRecords[date].checkIn && dailyRecords[date].checkOut 
            ? (dailyRecords[date].checkOut.timestamp - dailyRecords[date].checkIn.timestamp) / (1000 * 60 * 60)
            : 0
        }))
      }
    });
  } catch (error) {
    logger.error('Get attendance summary failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get attendance summary'
    });
  }
});

module.exports = router;
