const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const logger = require('../utils/logger');
const faceRecognitionService = require('../services/faceRecognitionService');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// @route   POST /api/attendance/check-in
// @desc    Mark check-in with face recognition
// @access  Private
router.post('/check-in', authenticateToken, upload.single('faceImage'), [
  body('latitude').isFloat().withMessage('Valid latitude is required'),
  body('longitude').isFloat().withMessage('Valid longitude is required'),
  body('accuracy').optional().isFloat().withMessage('Valid accuracy is required')
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

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Face image is required'
      });
    }

    const { latitude, longitude, accuracy, locationAddress, deviceInfo } = req.body;
    const userId = req.user.id;
    const timestamp = new Date();

    // Check if user already checked in today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const existingCheckIn = await db('attendance_records')
      .where('user_id', userId)
      .where('type', 'check_in')
      .whereBetween('timestamp', [todayStart, todayEnd])
      .where('status', 'approved')
      .first();

    if (existingCheckIn) {
      return res.status(400).json({
        success: false,
        message: 'You have already checked in today'
      });
    }

    // Perform face recognition
    const imageBuffer = req.file.buffer;
    
    // Detect faces in the image
    const faces = await faceRecognitionService.detectFaces(imageBuffer);
    if (faces.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No face detected in the image'
      });
    }

    const face = faces[0]; // Use the first detected face

    // Perform anti-spoofing checks
    const antiSpoofingResult = await faceRecognitionService.performAntiSpoofingChecks(imageBuffer, face.box);
    if (!antiSpoofingResult.passed) {
      return res.status(400).json({
        success: false,
        message: 'Liveness detection failed. Please ensure you are a live person.',
        details: {
          livenessScore: antiSpoofingResult.overallScore,
          checks: antiSpoofingResult
        }
      });
    }

    // Extract face features
    const faceFeatures = await faceRecognitionService.extractFaceFeatures(imageBuffer, face.box);
    
    // Get user's face templates
    const faceTemplates = await db('face_templates')
      .where('user_id', userId)
      .where('is_primary', true);

    if (faceTemplates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No face template found. Please register your face first.'
      });
    }

    // Compare with stored templates
    let bestMatch = null;
    let bestSimilarity = 0;

    for (const template of faceTemplates) {
      const decryptedTemplate = faceRecognitionService.decryptFaceTemplate(template.face_encoding);
      const comparison = await faceRecognitionService.compareFaces(faceFeatures, decryptedTemplate);
      
      if (comparison.similarity > bestSimilarity) {
        bestSimilarity = comparison.similarity;
        bestMatch = comparison;
      }
    }

    const confidenceThreshold = 0.8;
    if (!bestMatch || bestSimilarity < confidenceThreshold) {
      return res.status(400).json({
        success: false,
        message: 'Face recognition failed. Please try again.',
        details: {
          similarity: bestSimilarity,
          threshold: confidenceThreshold
        }
      });
    }

    // Check work schedule and location
    const workSchedule = await db('work_schedules')
      .where('user_id', userId)
      .where('is_active', true)
      .where(function() {
        this.whereNull('effective_from').orWhere('effective_from', '<=', new Date());
      })
      .where(function() {
        this.whereNull('effective_to').orWhere('effective_to', '>=', new Date());
      })
      .first();

    let locationValid = true;
    let locationMessage = '';

    if (workSchedule && workSchedule.latitude && workSchedule.longitude) {
      const distance = calculateDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(workSchedule.latitude),
        parseFloat(workSchedule.longitude)
      );

      if (distance > workSchedule.location_radius) {
        locationValid = false;
        locationMessage = `You are ${Math.round(distance)}m away from your work location. Allowed radius: ${workSchedule.location_radius}m`;
      }
    }

    // Create attendance record
    const [attendanceRecord] = await db('attendance_records')
      .insert({
        user_id: userId,
        type: 'check_in',
        timestamp,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        location_address: locationAddress,
        accuracy: accuracy ? parseFloat(accuracy) : null,
        confidence_score: bestSimilarity,
        liveness_passed: antiSpoofingResult.passed,
        liveness_data: antiSpoofingResult,
        status: locationValid ? 'approved' : 'flagged',
        rejection_reason: locationValid ? null : locationMessage,
        device_info: deviceInfo ? JSON.parse(deviceInfo) : null,
        is_offline: false
      })
      .returning('*');

    // Log the action
    await db('audit_logs').insert({
      user_id: userId,
      action: 'attendance_check_in',
      resource_type: 'attendance_record',
      resource_id: attendanceRecord.id,
      new_values: {
        timestamp,
        latitude,
        longitude,
        confidence_score: bestSimilarity,
        liveness_passed: antiSpoofingResult.passed
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'low'
    });

    // Emit real-time update
    const io = req.app.get('io');
    io.to('admin_room').emit('attendance_update', {
      type: 'check_in',
      userId,
      timestamp,
      location: { latitude, longitude },
      status: attendanceRecord.status
    });

    logger.info(`Check-in recorded for user ${userId}: ${attendanceRecord.status}`);

    res.json({
      success: true,
      message: locationValid ? 'Check-in successful' : 'Check-in recorded but location flagged',
      data: {
        attendanceRecord: {
          id: attendanceRecord.id,
          type: attendanceRecord.type,
          timestamp: attendanceRecord.timestamp,
          status: attendanceRecord.status,
          confidenceScore: attendanceRecord.confidence_score,
          livenessPassed: attendanceRecord.liveness_passed,
          locationValid,
          locationMessage
        }
      }
    });
  } catch (error) {
    logger.error('Check-in failed:', error);
    res.status(500).json({
      success: false,
      message: 'Check-in failed'
    });
  }
});

// @route   POST /api/attendance/check-out
// @desc    Mark check-out with face recognition
// @access  Private
router.post('/check-out', authenticateToken, upload.single('faceImage'), [
  body('latitude').isFloat().withMessage('Valid latitude is required'),
  body('longitude').isFloat().withMessage('Valid longitude is required')
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

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Face image is required'
      });
    }

    const { latitude, longitude, accuracy, locationAddress, deviceInfo } = req.body;
    const userId = req.user.id;
    const timestamp = new Date();

    // Check if user has checked in today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const checkInRecord = await db('attendance_records')
      .where('user_id', userId)
      .where('type', 'check_in')
      .whereBetween('timestamp', [todayStart, todayEnd])
      .where('status', 'approved')
      .first();

    if (!checkInRecord) {
      return res.status(400).json({
        success: false,
        message: 'You must check in before checking out'
      });
    }

    // Check if already checked out
    const existingCheckOut = await db('attendance_records')
      .where('user_id', userId)
      .where('type', 'check_out')
      .whereBetween('timestamp', [todayStart, todayEnd])
      .where('status', 'approved')
      .first();

    if (existingCheckOut) {
      return res.status(400).json({
        success: false,
        message: 'You have already checked out today'
      });
    }

    // Perform face recognition (similar to check-in)
    const imageBuffer = req.file.buffer;
    const faces = await faceRecognitionService.detectFaces(imageBuffer);
    
    if (faces.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No face detected in the image'
      });
    }

    const face = faces[0];
    const antiSpoofingResult = await faceRecognitionService.performAntiSpoofingChecks(imageBuffer, face.box);
    
    if (!antiSpoofingResult.passed) {
      return res.status(400).json({
        success: false,
        message: 'Liveness detection failed. Please ensure you are a live person.'
      });
    }

    const faceFeatures = await faceRecognitionService.extractFaceFeatures(imageBuffer, face.box);
    const faceTemplates = await db('face_templates')
      .where('user_id', userId)
      .where('is_primary', true);

    let bestMatch = null;
    let bestSimilarity = 0;

    for (const template of faceTemplates) {
      const decryptedTemplate = faceRecognitionService.decryptFaceTemplate(template.face_encoding);
      const comparison = await faceRecognitionService.compareFaces(faceFeatures, decryptedTemplate);
      
      if (comparison.similarity > bestSimilarity) {
        bestSimilarity = comparison.similarity;
        bestMatch = comparison;
      }
    }

    const confidenceThreshold = 0.8;
    if (!bestMatch || bestSimilarity < confidenceThreshold) {
      return res.status(400).json({
        success: false,
        message: 'Face recognition failed. Please try again.'
      });
    }

    // Create check-out record
    const [attendanceRecord] = await db('attendance_records')
      .insert({
        user_id: userId,
        type: 'check_out',
        timestamp,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        location_address: locationAddress,
        accuracy: accuracy ? parseFloat(accuracy) : null,
        confidence_score: bestSimilarity,
        liveness_passed: antiSpoofingResult.passed,
        liveness_data: antiSpoofingResult,
        status: 'approved',
        device_info: deviceInfo ? JSON.parse(deviceInfo) : null,
        is_offline: false
      })
      .returning('*');

    // Log the action
    await db('audit_logs').insert({
      user_id: userId,
      action: 'attendance_check_out',
      resource_type: 'attendance_record',
      resource_id: attendanceRecord.id,
      new_values: {
        timestamp,
        latitude,
        longitude,
        confidence_score: bestSimilarity
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'low'
    });

    // Emit real-time update
    const io = req.app.get('io');
    io.to('admin_room').emit('attendance_update', {
      type: 'check_out',
      userId,
      timestamp,
      location: { latitude, longitude },
      status: attendanceRecord.status
    });

    logger.info(`Check-out recorded for user ${userId}`);

    res.json({
      success: true,
      message: 'Check-out successful',
      data: {
        attendanceRecord: {
          id: attendanceRecord.id,
          type: attendanceRecord.type,
          timestamp: attendanceRecord.timestamp,
          status: attendanceRecord.status,
          confidenceScore: attendanceRecord.confidence_score,
          livenessPassed: attendanceRecord.liveness_passed
        }
      }
    });
  } catch (error) {
    logger.error('Check-out failed:', error);
    res.status(500).json({
      success: false,
      message: 'Check-out failed'
    });
  }
});

// @route   GET /api/attendance/history
// @desc    Get user's attendance history
// @access  Private
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate } = req.query;
    const userId = req.user.id;
    const offset = (page - 1) * limit;

    let query = db('attendance_records')
      .where('user_id', userId)
      .orderBy('timestamp', 'desc');

    if (startDate && endDate) {
      query = query.whereBetween('timestamp', [startDate, endDate]);
    }

    const records = await query
      .limit(limit)
      .offset(offset)
      .select('*');

    const total = await db('attendance_records')
      .where('user_id', userId)
      .count('* as count')
      .first();

    res.json({
      success: true,
      data: {
        records,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Get attendance history failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get attendance history'
    });
  }
});

// @route   GET /api/attendance/today
// @desc    Get today's attendance status
// @access  Private
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayRecords = await db('attendance_records')
      .where('user_id', userId)
      .whereBetween('timestamp', [todayStart, todayEnd])
      .orderBy('timestamp', 'asc');

    const checkIn = todayRecords.find(record => record.type === 'check_in' && record.status === 'approved');
    const checkOut = todayRecords.find(record => record.type === 'check_out' && record.status === 'approved');

    res.json({
      success: true,
      data: {
        checkIn: checkIn ? {
          timestamp: checkIn.timestamp,
          location: {
            latitude: checkIn.latitude,
            longitude: checkIn.longitude,
            address: checkIn.location_address
          }
        } : null,
        checkOut: checkOut ? {
          timestamp: checkOut.timestamp,
          location: {
            latitude: checkOut.latitude,
            longitude: checkOut.longitude,
            address: checkOut.location_address
          }
        } : null,
        status: checkIn && checkOut ? 'completed' : checkIn ? 'checked_in' : 'not_checked_in'
      }
    });
  } catch (error) {
    logger.error('Get today attendance failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get today attendance'
    });
  }
});

// Helper function to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

module.exports = router;
