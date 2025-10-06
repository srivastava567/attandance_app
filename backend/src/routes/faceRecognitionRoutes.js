const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const logger = require('../utils/logger');
const faceRecognitionService = require('../services/faceRecognitionService');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

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

// @route   POST /api/face-recognition/register
// @desc    Register user's face template
// @access  Private (Admin only)
router.post('/register', authenticateToken, requireAdmin, upload.single('faceImage'), [
  body('userId').isUUID().withMessage('Valid user ID is required'),
  body('isPrimary').optional().isBoolean().withMessage('isPrimary must be boolean')
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

    const { userId, isPrimary = false } = req.body;
    const imageBuffer = req.file.buffer;

    // Verify user exists
    const user = await db('users')
      .where('id', userId)
      .andWhere('status', 'active')
      .first();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Detect faces in the image
    const faces = await faceRecognitionService.detectFaces(imageBuffer);
    if (faces.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No face detected in the image'
      });
    }

    if (faces.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Multiple faces detected. Please provide an image with only one face.'
      });
    }

    const face = faces[0];

    // Check face quality
    if (face.confidence < 0.8) {
      return res.status(400).json({
        success: false,
        message: 'Face quality is too low. Please provide a clearer image.'
      });
    }

    // Perform liveness detection
    const livenessResult = await faceRecognitionService.detectLiveness(imageBuffer, face.box);
    if (!livenessResult.isLive) {
      return res.status(400).json({
        success: false,
        message: 'Liveness detection failed. Please ensure you are a live person.'
      });
    }

    // Extract face features
    const faceFeatures = await faceRecognitionService.extractFaceFeatures(imageBuffer, face.box);
    const featuresArray = await faceFeatures.data();
    
    // Encrypt face template
    const encryptedTemplate = faceRecognitionService.encryptFaceTemplate(featuresArray);
    const faceHash = faceRecognitionService.generateFaceHash(featuresArray);

    // Check for duplicate face templates
    const existingTemplates = await db('face_templates')
      .where('user_id', userId);

    // Compare with existing templates to prevent duplicates
    for (const existingTemplate of existingTemplates) {
      const decryptedExisting = faceRecognitionService.decryptFaceTemplate(existingTemplate.face_encoding);
      const comparison = await faceRecognitionService.compareFaces(faceFeatures, decryptedExisting);
      
      if (comparison.similarity > 0.9) {
        return res.status(400).json({
          success: false,
          message: 'Similar face template already exists for this user'
        });
      }
    }

    // If this is set as primary, unset other primary templates
    if (isPrimary) {
      await db('face_templates')
        .where('user_id', userId)
        .update({ is_primary: false });
    }

    // Create face template record
    const [faceTemplate] = await db('face_templates')
      .insert({
        user_id: userId,
        face_encoding: encryptedTemplate,
        face_hash: faceHash,
        face_metadata: {
          confidence: face.confidence,
          box: face.box,
          liveness: livenessResult,
          quality_score: Math.round(face.confidence * 100)
        },
        quality_score: Math.round(face.confidence * 100),
        is_primary: isPrimary || existingTemplates.length === 0 // First template is primary by default
      })
      .returning('*');

    // Log the action
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'face_template_registered',
      resource_type: 'face_template',
      resource_id: faceTemplate.id,
      new_values: {
        user_id: userId,
        quality_score: faceTemplate.quality_score,
        is_primary: faceTemplate.is_primary
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'medium'
    });

    logger.info(`Face template registered for user ${userId} by admin ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Face template registered successfully',
      data: {
        faceTemplate: {
          id: faceTemplate.id,
          userId: faceTemplate.user_id,
          qualityScore: faceTemplate.quality_score,
          isPrimary: faceTemplate.is_primary,
          createdAt: faceTemplate.created_at
        }
      }
    });
  } catch (error) {
    logger.error('Face template registration failed:', error);
    res.status(500).json({
      success: false,
      message: 'Face template registration failed'
    });
  }
});

// @route   POST /api/face-recognition/verify
// @desc    Verify user's face against stored templates
// @access  Private
router.post('/verify', authenticateToken, upload.single('faceImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Face image is required'
      });
    }

    const userId = req.user.id;
    const imageBuffer = req.file.buffer;

    // Detect faces in the image
    const faces = await faceRecognitionService.detectFaces(imageBuffer);
    if (faces.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No face detected in the image'
      });
    }

    const face = faces[0];

    // Perform liveness detection
    const livenessResult = await faceRecognitionService.detectLiveness(imageBuffer, face.box);
    if (!livenessResult.isLive) {
      return res.status(400).json({
        success: false,
        message: 'Liveness detection failed'
      });
    }

    // Extract face features
    const faceFeatures = await faceRecognitionService.extractFaceFeatures(imageBuffer, face.box);

    // Get user's face templates
    const faceTemplates = await db('face_templates')
      .where('user_id', userId);

    if (faceTemplates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No face templates found for this user'
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
        bestMatch = {
          templateId: template.id,
          similarity: comparison.similarity,
          isPrimary: template.is_primary
        };
      }
    }

    const confidenceThreshold = 0.8;
    const isVerified = bestMatch && bestSimilarity >= confidenceThreshold;

    // Log verification attempt
    await db('audit_logs').insert({
      user_id: userId,
      action: 'face_verification',
      new_values: {
        similarity: bestSimilarity,
        threshold: confidenceThreshold,
        verified: isVerified,
        liveness_passed: livenessResult.isLive
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'low'
    });

    res.json({
      success: true,
      message: isVerified ? 'Face verification successful' : 'Face verification failed',
      data: {
        verified: isVerified,
        similarity: bestSimilarity,
        threshold: confidenceThreshold,
        livenessPassed: livenessResult.isLive,
        bestMatch: bestMatch ? {
          templateId: bestMatch.templateId,
          isPrimary: bestMatch.isPrimary
        } : null
      }
    });
  } catch (error) {
    logger.error('Face verification failed:', error);
    res.status(500).json({
      success: false,
      message: 'Face verification failed'
    });
  }
});

// @route   GET /api/face-recognition/templates/:userId
// @desc    Get user's face templates
// @access  Private (Admin only)
router.get('/templates/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const templates = await db('face_templates')
      .where('user_id', userId)
      .select('id', 'quality_score', 'is_primary', 'created_at', 'updated_at')
      .orderBy('created_at', 'desc');

    res.json({
      success: true,
      data: {
        templates: templates.map(template => ({
          id: template.id,
          qualityScore: template.quality_score,
          isPrimary: template.is_primary,
          createdAt: template.created_at,
          updatedAt: template.updated_at
        }))
      }
    });
  } catch (error) {
    logger.error('Get face templates failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get face templates'
    });
  }
});

// @route   DELETE /api/face-recognition/templates/:templateId
// @desc    Delete a face template
// @access  Private (Admin only)
router.delete('/templates/:templateId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { templateId } = req.params;

    const template = await db('face_templates')
      .where('id', templateId)
      .first();

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Face template not found'
      });
    }

    await db('face_templates')
      .where('id', templateId)
      .del();

    // Log the action
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'face_template_deleted',
      resource_type: 'face_template',
      resource_id: templateId,
      old_values: {
        user_id: template.user_id,
        quality_score: template.quality_score,
        is_primary: template.is_primary
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'medium'
    });

    logger.info(`Face template ${templateId} deleted by admin ${req.user.id}`);

    res.json({
      success: true,
      message: 'Face template deleted successfully'
    });
  } catch (error) {
    logger.error('Delete face template failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete face template'
    });
  }
});

// @route   PUT /api/face-recognition/templates/:templateId/primary
// @desc    Set a face template as primary
// @access  Private (Admin only)
router.put('/templates/:templateId/primary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { templateId } = req.params;

    const template = await db('face_templates')
      .where('id', templateId)
      .first();

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Face template not found'
      });
    }

    // Unset other primary templates for this user
    await db('face_templates')
      .where('user_id', template.user_id)
      .update({ is_primary: false });

    // Set this template as primary
    await db('face_templates')
      .where('id', templateId)
      .update({ is_primary: true });

    // Log the action
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'face_template_set_primary',
      resource_type: 'face_template',
      resource_id: templateId,
      new_values: {
        user_id: template.user_id,
        is_primary: true
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      severity: 'low'
    });

    logger.info(`Face template ${templateId} set as primary by admin ${req.user.id}`);

    res.json({
      success: true,
      message: 'Face template set as primary successfully'
    });
  } catch (error) {
    logger.error('Set primary face template failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set primary face template'
    });
  }
});

module.exports = router;
