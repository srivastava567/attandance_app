const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Generate JWT tokens
const generateTokens = (user) => {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employee_id
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });

  return { accessToken, refreshToken };
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public (but should be restricted to admins in production)
router.post('/register', [
  body('employeeId').notEmpty().withMessage('Employee ID is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('department').notEmpty().withMessage('Department is required'),
  body('position').notEmpty().withMessage('Position is required')
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
      employeeId,
      email,
      password,
      firstName,
      lastName,
      department,
      position,
      phone,
      role = 'employee'
    } = req.body;

    // Check if user already exists
    const existingUser = await db('users')
      .where('email', email)
      .orWhere('employee_id', employeeId)
      .first();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or employee ID already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const [newUser] = await db('users')
      .insert({
        employee_id: employeeId,
        email,
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        department,
        position,
        phone,
        role,
        status: 'active',
        is_verified: false
      })
      .returning(['id', 'employee_id', 'email', 'first_name', 'last_name', 'department', 'position', 'role', 'status']);

    logger.info(`New user registered: ${newUser.email}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: newUser
      }
    });
  } catch (error) {
    logger.error('User registration failed:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user and get token
// @access  Public
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
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

    const { email, password } = req.body;

    // Find user
    const user = await db('users')
      .where('email', email)
      .andWhere('status', 'active')
      .first();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Update last login
    await db('users')
      .where('id', user.id)
      .update({ last_login: new Date() });

    // Log successful login
    await db('audit_logs').insert({
      user_id: user.id,
      action: 'login',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'low'
    });

    logger.info(`User logged in: ${user.email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          employeeId: user.employee_id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          department: user.department,
          position: user.position,
          role: user.role
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    logger.error('Login failed:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', [
  body('refreshToken').notEmpty().withMessage('Refresh token is required')
], async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Find user
    const user = await db('users')
      .where('id', decoded.userId)
      .andWhere('status', 'active')
      .first();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const tokens = generateTokens(user);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: tokens
    });
  } catch (error) {
    logger.error('Token refresh failed:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Log logout action
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'logout',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'low'
    });

    logger.info(`User logged out: ${req.user.email}`);

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    logger.error('Logout failed:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db('users')
      .select('id', 'employee_id', 'email', 'first_name', 'last_name', 'department', 'position', 'role', 'status', 'last_login')
      .where('id', req.user.id)
      .first();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          employeeId: user.employee_id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          department: user.department,
          position: user.position,
          role: user.role,
          status: user.status,
          lastLogin: user.last_login
        }
      }
    });
  } catch (error) {
    logger.error('Get user profile failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
});

module.exports = router;
