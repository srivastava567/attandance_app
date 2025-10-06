import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { attendanceAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import AttendanceCard from '../components/AttendanceCard';
import EmptyState from '../components/EmptyState';

const AttendanceHistoryScreen = ({ navigation }) => {
  const { user } = useAuthStore();
  const { attendanceHistory, setAttendanceHistory } = useAttendanceStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadAttendanceHistory();
  }, []);

  const loadAttendanceHistory = async (pageNum = 1, isRefresh = false) => {
    try {
      if (pageNum === 1) {
        setIsLoading(true);
      } else {
        setLoadingMore(true);
      }

      const response = await attendanceAPI.getAttendanceHistory({
        page: pageNum,
        limit: 20,
      });

      if (response.success) {
        const newRecords = response.data.records;
        
        if (isRefresh || pageNum === 1) {
          setAttendanceHistory(newRecords);
        } else {
          setAttendanceHistory([...attendanceHistory, ...newRecords]);
        }

        setHasMore(newRecords.length === 20);
        setPage(pageNum);
      } else {
        Alert.alert('Error', response.message || 'Failed to load attendance history');
      }
    } catch (error) {
      console.error('Load attendance history failed:', error);
      Alert.alert('Error', 'Failed to load attendance history');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setLoadingMore(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadAttendanceHistory(1, true);
  };

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      loadAttendanceHistory(page + 1);
    }
  };

  const renderAttendanceItem = ({ item }) => (
    <AttendanceCard
      attendance={item}
      onPress={() => navigation.navigate('AttendanceDetail', { attendance: item })}
    />
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    
    return (
      <View style={styles.footerLoader}>
        <LoadingSpinner visible={true} size="small" />
      </View>
    );
  };

  const renderEmptyState = () => (
    <EmptyState
      title="No Attendance Records"
      subtitle="Your attendance history will appear here"
      icon="calendar-outline"
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Attendance History</Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        data={attendanceHistory}
        keyExtractor={(item) => item.id}
        renderItem={renderAttendanceItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={['#4CAF50']}
            tintColor="#4CAF50"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.1}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        showsVerticalScrollIndicator={false}
      />

      <LoadingSpinner visible={isLoading} />
    </View>
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
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    color: '#333',
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 60,
  },
  listContainer: {
    padding: 15,
    flexGrow: 1,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default AttendanceHistoryScreen;
