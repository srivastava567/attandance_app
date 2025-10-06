const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');
const crypto = require('crypto');
const logger = require('./logger');

class FaceRecognitionService {
  constructor() {
    this.model = null;
    this.faceDetectionModel = null;
    this.livenessModel = null;
    this.encryptionKey = process.env.ENCRYPTION_KEY;
    this.initialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing face recognition service...');
      
      // Load face detection model (MTCNN or similar)
      // In production, you would load pre-trained models
      this.faceDetectionModel = await this.loadFaceDetectionModel();
      
      // Load face recognition model (FaceNet or similar)
      this.model = await this.loadFaceRecognitionModel();
      
      // Load liveness detection model
      this.livenessModel = await this.loadLivenessModel();
      
      this.initialized = true;
      logger.info('Face recognition service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize face recognition service:', error);
      throw error;
    }
  }

  async loadFaceDetectionModel() {
    // Placeholder for face detection model loading
    // In production, load actual MTCNN or similar model
    return {
      detectFaces: async (imageBuffer) => {
        // Mock face detection - replace with actual model
        return [{
          box: { x: 100, y: 100, width: 200, height: 200 },
          confidence: 0.95
        }];
      }
    };
  }

  async loadFaceRecognitionModel() {
    // Placeholder for face recognition model loading
    // In production, load actual FaceNet or similar model
    return {
      extractFeatures: async (faceImage) => {
        // Mock feature extraction - replace with actual model
        const features = new Array(128).fill(0).map(() => Math.random());
        return tf.tensor2d([features]);
      }
    };
  }

  async loadLivenessModel() {
    // Placeholder for liveness detection model loading
    return {
      detectLiveness: async (faceImage, eyeBlinkData = null) => {
        // Mock liveness detection - replace with actual model
        return {
          isLive: Math.random() > 0.1, // 90% chance of being live
          confidence: 0.85,
          method: 'passive'
        };
      }
    };
  }

  async preprocessImage(imageBuffer) {
    try {
      // Convert to RGB and resize
      const processedBuffer = await sharp(imageBuffer)
        .resize(224, 224, { fit: 'cover' })
        .removeAlpha()
        .toBuffer();

      // Convert to tensor
      const tensor = tf.node.decodeImage(processedBuffer, 3);
      const normalized = tensor.div(255.0);
      
      return normalized;
    } catch (error) {
      logger.error('Image preprocessing failed:', error);
      throw error;
    }
  }

  async detectFaces(imageBuffer) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const processedImage = await this.preprocessImage(imageBuffer);
      const faces = await this.faceDetectionModel.detectFaces(imageBuffer);
      
      // Filter faces by confidence threshold
      const validFaces = faces.filter(face => face.confidence > 0.7);
      
      logger.info(`Detected ${validFaces.length} faces`);
      return validFaces;
    } catch (error) {
      logger.error('Face detection failed:', error);
      throw error;
    }
  }

  async extractFaceFeatures(imageBuffer, faceBox) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Crop face from image
      const faceImage = await sharp(imageBuffer)
        .extract({
          left: faceBox.x,
          top: faceBox.y,
          width: faceBox.width,
          height: faceBox.height
        })
        .resize(112, 112)
        .toBuffer();

      const processedFace = await this.preprocessImage(faceImage);
      const features = await this.model.extractFeatures(processedFace);
      
      return features;
    } catch (error) {
      logger.error('Face feature extraction failed:', error);
      throw error;
    }
  }

  async detectLiveness(imageBuffer, faceBox, eyeBlinkData = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Crop face for liveness detection
      const faceImage = await sharp(imageBuffer)
        .extract({
          left: faceBox.x,
          top: faceBox.y,
          width: faceBox.width,
          height: faceBox.height
        })
        .resize(224, 224)
        .toBuffer();

      const livenessResult = await this.livenessModel.detectLiveness(faceImage, eyeBlinkData);
      
      logger.info(`Liveness detection result: ${livenessResult.isLive ? 'LIVE' : 'SPOOF'} (confidence: ${livenessResult.confidence})`);
      return livenessResult;
    } catch (error) {
      logger.error('Liveness detection failed:', error);
      throw error;
    }
  }

  async compareFaces(features1, features2, threshold = 0.6) {
    try {
      // Calculate cosine similarity
      const dotProduct = tf.sum(tf.mul(features1, features2));
      const norm1 = tf.sqrt(tf.sum(tf.square(features1)));
      const norm2 = tf.sqrt(tf.sum(tf.square(features2)));
      const similarity = dotProduct.div(norm1.mul(norm2));
      
      const similarityValue = await similarity.data();
      const isMatch = similarityValue[0] > threshold;
      
      logger.info(`Face comparison: similarity=${similarityValue[0].toFixed(4)}, match=${isMatch}`);
      
      return {
        isMatch,
        similarity: similarityValue[0],
        threshold
      };
    } catch (error) {
      logger.error('Face comparison failed:', error);
      throw error;
    }
  }

  encryptFaceTemplate(template) {
    try {
      const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
      let encrypted = cipher.update(JSON.stringify(template), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    } catch (error) {
      logger.error('Face template encryption failed:', error);
      throw error;
    }
  }

  decryptFaceTemplate(encryptedTemplate) {
    try {
      const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
      let decrypted = decipher.update(encryptedTemplate, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Face template decryption failed:', error);
      throw error;
    }
  }

  generateFaceHash(template) {
    return crypto.createHash('sha256')
      .update(JSON.stringify(template))
      .digest('hex');
  }

  async performAntiSpoofingChecks(imageBuffer, faceBox) {
    const checks = {
      livenessDetection: null,
      textureAnalysis: null,
      depthAnalysis: null,
      overallScore: 0
    };

    try {
      // 1. Liveness Detection
      checks.livenessDetection = await this.detectLiveness(imageBuffer, faceBox);
      
      // 2. Texture Analysis (mock implementation)
      checks.textureAnalysis = {
        textureScore: Math.random() * 0.3 + 0.7, // 0.7-1.0
        isRealTexture: Math.random() > 0.1
      };
      
      // 3. Depth Analysis (mock implementation)
      checks.depthAnalysis = {
        depthScore: Math.random() * 0.2 + 0.8, // 0.8-1.0
        hasDepth: Math.random() > 0.05
      };

      // Calculate overall anti-spoofing score
      checks.overallScore = (
        checks.livenessDetection.confidence * 0.4 +
        checks.textureAnalysis.textureScore * 0.3 +
        checks.depthAnalysis.depthScore * 0.3
      );

      const isLive = checks.overallScore > 0.75 && 
                    checks.livenessDetection.isLive &&
                    checks.textureAnalysis.isRealTexture &&
                    checks.depthAnalysis.hasDepth;

      logger.info(`Anti-spoofing checks completed. Overall score: ${checks.overallScore.toFixed(3)}, Live: ${isLive}`);
      
      return {
        ...checks,
        isLive,
        passed: isLive
      };
    } catch (error) {
      logger.error('Anti-spoofing checks failed:', error);
      throw error;
    }
  }
}

module.exports = new FaceRecognitionService();
