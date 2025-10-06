import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { userAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ProfileCard from '../components/ProfileCard';
import StatsCard from '../components/StatsCard';
import ActionButton from '../components/ActionButton';

const ProfileScreen = ({ navigation }) => {
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalDays: 0,
    presentDays: 0,
    absentDays: 0,
    averageHours: 0,
    attendanceRate: 0,
  });

  useEffect(() => {
    loadProfile();
    loadStats();
  }, []);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      const response = await userAPI.getProfile();
      
      if (response.success) {
        setProfile(response.data.user);
      } else {
        Alert.alert('Error', response.message || 'Failed to load profile');
      }
    } catch (error) {
      console.error('Load profile failed:', error);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await userAPI.getAttendanceSummary();
      
      if (response.success) {
        setStats(response.data.summary);
      }
    } catch (error) {
      console.error('Load stats failed:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: () => {
            logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          }
        },
      ]
    );
  };

  const handleEditProfile = () => {
    navigation.navigate('EditProfile');
  };

  const handleChangePassword = () => {
    navigation.navigate('ChangePassword');
  };

  const handleSupport = () => {
    Linking.openURL('mailto:support@attendance-system.com');
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL('https://attendance-system.com/privacy');
  };

  const handleTermsOfService = () => {
    Linking.openURL('https://attendance-system.com/terms');
  };

  if (!profile) {
    return <LoadingSpinner visible={true} />;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <ProfileCard user={profile} onEdit={handleEditProfile} />

        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Attendance Statistics</Text>
          <View style={styles.statsGrid}>
            <StatsCard
              title="Attendance Rate"
              value={`${stats.attendanceRate.toFixed(1)}%`}
              icon="checkmark-circle"
              color="#4CAF50"
            />
            <StatsCard
              title="Present Days"
              value={stats.presentDays.toString()}
              icon="calendar"
              color="#2196F3"
            />
            <StatsCard
              title="Average Hours"
              value={`${stats.averageHours.toFixed(1)}h`}
              icon="time"
              color="#FF9800"
            />
            <StatsCard
              title="Total Days"
              value={stats.totalDays.toString()}
              icon="calendar-outline"
              color="#9C27B0"
            />
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
          
          <ActionButton
            title="Edit Profile"
            icon="person-outline"
            onPress={handleEditProfile}
          />
          
          <ActionButton
            title="Change Password"
            icon="lock-outline"
            onPress={handleChangePassword}
          />
          
          <ActionButton
            title="Face Templates"
            icon="face-outline"
            onPress={() => navigation.navigate('FaceTemplates')}
          />
        </View>

        <View style={styles.supportContainer}>
          <Text style={styles.sectionTitle}>Support & Legal</Text>
          
          <ActionButton
            title="Contact Support"
            icon="help-outline"
            onPress={handleSupport}
          />
          
          <ActionButton
            title="Privacy Policy"
            icon="shield-outline"
            onPress={handlePrivacyPolicy}
          />
          
          <ActionButton
            title="Terms of Service"
            icon="document-text-outline"
            onPress={handleTermsOfService}
          />
        </View>

        <View style={styles.appInfoContainer}>
          <Text style={styles.appVersion}>
            Version 1.0.0
          </Text>
          <Text style={styles.appCopyright}>
            © 2024 Attendance System
          </Text>
        </View>
      </View>

      <LoadingSpinner visible={isLoading} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    color: '#333',
    fontSize: 18,
    fontWeight: 'bold',
  },
  logoutButton: {
    padding: 8,
  },
  logoutButtonText: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: '500',
  },
  content: {
    padding: 15,
  },
  statsContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionsContainer: {
    marginBottom: 20,
  },
  supportContainer: {
    marginBottom: 20,
  },
  appInfoContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  appVersion: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  appCopyright: {
    fontSize: 12,
    color: '#999',
  },
});

export default ProfileScreen;
