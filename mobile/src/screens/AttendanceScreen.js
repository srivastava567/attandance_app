import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  PermissionsAndroid,
  Platform,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import Geolocation from 'react-native-geolocation-service';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import RNFS from 'react-native-fs';
import CryptoJS from 'react-native-crypto-js';
import DeviceInfo from 'react-native-device-info';
import NetInfo from '@react-native-community/netinfo';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../store/authStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { attendanceAPI } from '../services/api';
import { saveOfflineAttendance } from '../services/offlineService';
import { checkLocationPermission, getCurrentLocation } from '../services/locationService';
import LoadingSpinner from '../components/LoadingSpinner';
import FaceDetectionOverlay from '../components/FaceDetectionOverlay';

const AttendanceScreen = ({ navigation }) => {
  const { user, token } = useAuthStore();
  const { todayAttendance, setTodayAttendance } = useAttendanceStore();
  const [isLoading, setIsLoading] = useState(false);
  const [cameraPermission, setCameraPermission] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceBox, setFaceBox] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const devices = useCameraDevices();
  const device = devices.back;

  useEffect(() => {
    checkPermissions();
    checkNetworkStatus();
    loadTodayAttendance();
  }, []);

  const checkPermissions = async () => {
    try {
      // Check camera permission
      const cameraStatus = await request(
        Platform.OS === 'ios' 
          ? PERMISSIONS.IOS.CAMERA 
          : PERMISSIONS.ANDROID.CAMERA
      );
      setCameraPermission(cameraStatus === RESULTS.GRANTED);

      // Check location permission
      const locationStatus = await checkLocationPermission();
      setLocationPermission(locationStatus);

      if (cameraStatus !== RESULTS.GRANTED) {
        Alert.alert(
          'Camera Permission Required',
          'Please grant camera permission to mark attendance',
          [{ text: 'OK' }]
        );
      }

      if (!locationStatus) {
        Alert.alert(
          'Location Permission Required',
          'Please grant location permission to mark attendance',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Permission check failed:', error);
    }
  };

  const checkNetworkStatus = () => {
    NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
    });
  };

  const loadTodayAttendance = async () => {
    try {
      const response = await attendanceAPI.getTodayAttendance();
      if (response.success) {
        setTodayAttendance(response.data);
      }
    } catch (error) {
      console.error('Failed to load today attendance:', error);
    }
  };

  const handleFaceDetection = (faces) => {
    if (faces.length > 0) {
      setFaceDetected(true);
      setFaceBox(faces[0].bounds);
    } else {
      setFaceDetected(false);
      setFaceBox(null);
    }
  };

  const capturePhoto = async () => {
    if (!faceDetected) {
      Toast.show({
        type: 'error',
        text1: 'No Face Detected',
        text2: 'Please position your face within the frame',
      });
      return;
    }

    setIsCapturing(true);
    setIsLoading(true);

    try {
      // Get current location
      const location = await getCurrentLocation();
      if (!location) {
        throw new Error('Unable to get current location');
      }

      // Get device info
      const deviceInfo = {
        deviceId: await DeviceInfo.getUniqueId(),
        deviceName: await DeviceInfo.getDeviceName(),
        osVersion: await DeviceInfo.getSystemVersion(),
        appVersion: await DeviceInfo.getVersion(),
        timestamp: new Date().toISOString(),
      };

      const attendanceData = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        locationAddress: location.address,
        deviceInfo: JSON.stringify(deviceInfo),
      };

      if (isOnline) {
        // Online attendance marking
        await markAttendanceOnline(attendanceData);
      } else {
        // Offline attendance marking
        await markAttendanceOffline(attendanceData);
      }
    } catch (error) {
      console.error('Attendance marking failed:', error);
      Toast.show({
        type: 'error',
        text1: 'Attendance Failed',
        text2: error.message || 'Please try again',
      });
    } finally {
      setIsLoading(false);
      setIsCapturing(false);
    }
  };

  const markAttendanceOnline = async (attendanceData) => {
    try {
      // Capture photo from camera
      const photoUri = await captureCameraPhoto();
      if (!photoUri) {
        throw new Error('Failed to capture photo');
      }

      // Create form data
      const formData = new FormData();
      formData.append('faceImage', {
        uri: photoUri,
        type: 'image/jpeg',
        name: 'face.jpg',
      });
      formData.append('latitude', attendanceData.latitude.toString());
      formData.append('longitude', attendanceData.longitude.toString());
      formData.append('accuracy', attendanceData.accuracy?.toString() || '');
      formData.append('locationAddress', attendanceData.locationAddress || '');
      formData.append('deviceInfo', attendanceData.deviceInfo);

      // Determine attendance type
      const attendanceType = todayAttendance.checkIn ? 'check_out' : 'check_in';
      
      const response = await attendanceAPI.markAttendance(attendanceType, formData);
      
      if (response.success) {
        Toast.show({
          type: 'success',
          text1: 'Attendance Marked',
          text2: `Successfully ${attendanceType === 'check_in' ? 'checked in' : 'checked out'}`,
        });
        
        // Update local state
        loadTodayAttendance();
        
        // Navigate back or show success screen
        navigation.goBack();
      } else {
        throw new Error(response.message || 'Attendance marking failed');
      }
    } catch (error) {
      // If online fails, try offline
      await markAttendanceOffline(attendanceData);
    }
  };

  const markAttendanceOffline = async (attendanceData) => {
    try {
      // Capture photo
      const photoUri = await captureCameraPhoto();
      if (!photoUri) {
        throw new Error('Failed to capture photo');
      }

      // Encrypt photo for offline storage
      const photoData = await RNFS.readFile(photoUri, 'base64');
      const encryptedPhoto = CryptoJS.AES.encrypt(photoData, 'attendance_key').toString();

      const offlineAttendance = {
        id: Date.now().toString(),
        userId: user.id,
        type: todayAttendance.checkIn ? 'check_out' : 'check_in',
        timestamp: new Date().toISOString(),
        latitude: attendanceData.latitude,
        longitude: attendanceData.longitude,
        accuracy: attendanceData.accuracy,
        locationAddress: attendanceData.locationAddress,
        photoData: encryptedPhoto,
        deviceInfo: attendanceData.deviceInfo,
        isOffline: true,
        synced: false,
      };

      await saveOfflineAttendance(offlineAttendance);

      Toast.show({
        type: 'success',
        text1: 'Attendance Saved Offline',
        text2: 'Will sync when connection is restored',
      });

      navigation.goBack();
    } catch (error) {
      throw new Error('Failed to save offline attendance');
    }
  };

  const captureCameraPhoto = async () => {
    // This would integrate with the camera to capture a photo
    // For now, return a placeholder
    return 'file://placeholder.jpg';
  };

  const getAttendanceButtonText = () => {
    if (todayAttendance.checkIn && todayAttendance.checkOut) {
      return 'Attendance Complete';
    } else if (todayAttendance.checkIn) {
      return 'Check Out';
    } else {
      return 'Check In';
    }
  };

  const isAttendanceComplete = () => {
    return todayAttendance.checkIn && todayAttendance.checkOut;
  };

  const canMarkAttendance = () => {
    return cameraPermission && locationPermission && !isAttendanceComplete() && !isLoading;
  };

  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Camera not available</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mark Attendance</Text>
        <View style={styles.statusIndicator}>
          <View style={[
            styles.statusDot, 
            { backgroundColor: isOnline ? '#4CAF50' : '#FF9800' }
          ]} />
          <Text style={styles.statusText}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      <View style={styles.cameraContainer}>
        <Camera
          style={styles.camera}
          device={device}
          isActive={true}
          photo={true}
          onFaceDetection={handleFaceDetection}
        />
        
        <FaceDetectionOverlay
          faceDetected={faceDetected}
          faceBox={faceBox}
          isCapturing={isCapturing}
        />
      </View>

      <View style={styles.controlsContainer}>
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsTitle}>Instructions:</Text>
          <Text style={styles.instructionsText}>
            • Position your face within the frame
          </Text>
          <Text style={styles.instructionsText}>
            • Ensure good lighting
          </Text>
          <Text style={styles.instructionsText}>
            • Look directly at the camera
          </Text>
          <Text style={styles.instructionsText}>
            • Tap the button when ready
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.attendanceButton,
            !canMarkAttendance() && styles.attendanceButtonDisabled
          ]}
          onPress={capturePhoto}
          disabled={!canMarkAttendance()}
        >
          <Text style={styles.attendanceButtonText}>
            {getAttendanceButtonText()}
          </Text>
        </TouchableOpacity>

        <View style={styles.todayStatusContainer}>
          <Text style={styles.todayStatusTitle}>Today's Status:</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Check In:</Text>
            <Text style={[
              styles.statusValue,
              { color: todayAttendance.checkIn ? '#4CAF50' : '#757575' }
            ]}>
              {todayAttendance.checkIn 
                ? new Date(todayAttendance.checkIn.timestamp).toLocaleTimeString()
                : 'Not checked in'
              }
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Check Out:</Text>
            <Text style={[
              styles.statusValue,
              { color: todayAttendance.checkOut ? '#4CAF50' : '#757575' }
            ]}>
              {todayAttendance.checkOut 
                ? new Date(todayAttendance.checkOut.timestamp).toLocaleTimeString()
                : 'Not checked out'
              }
            </Text>
          </View>
        </View>
      </View>

      <LoadingSpinner visible={isLoading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#1a1a1a',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  controlsContainer: {
    backgroundColor: '#1a1a1a',
    padding: 20,
  },
  instructionsContainer: {
    marginBottom: 20,
  },
  instructionsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  instructionsText: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 4,
  },
  attendanceButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 20,
  },
  attendanceButtonDisabled: {
    backgroundColor: '#757575',
  },
  attendanceButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  todayStatusContainer: {
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 10,
  },
  todayStatusTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusLabel: {
    color: '#ccc',
    fontSize: 14,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
});

export default AttendanceScreen;
