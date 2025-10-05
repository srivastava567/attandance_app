# Testing Framework and Deployment Guide

## 1. Testing Framework

### Backend Testing
```bash
# Install testing dependencies
cd backend
npm install --save-dev jest supertest @types/jest

# Run tests
npm test
npm run test:coverage
npm run test:watch
```

### Mobile App Testing
```bash
# Install testing dependencies
cd mobile
npm install --save-dev jest @testing-library/react-native

# Run tests
npm test
npm run test:android
npm run test:ios
```

### Admin Dashboard Testing
```bash
# Install testing dependencies
cd admin-dashboard
npm install --save-dev @testing-library/react @testing-library/jest-dom

# Run tests
npm test
npm run test:coverage
```

## 2. Test Categories

### Unit Tests
- **Backend**: API endpoints, business logic, utilities
- **Mobile**: Components, services, stores
- **Admin**: Components, utilities, API calls

### Integration Tests
- **Database**: Data persistence, migrations, queries
- **API**: End-to-end API workflows
- **Authentication**: Login, token refresh, logout flows

### End-to-End Tests
- **Mobile**: Complete attendance marking workflow
- **Admin**: User management, attendance approval workflows
- **Cross-platform**: Mobile to backend integration

### Performance Tests
- **Load Testing**: API performance under load
- **Stress Testing**: System limits and failure points
- **Mobile Performance**: App performance on various devices

### Security Tests
- **Penetration Testing**: Vulnerability assessment
- **Authentication Testing**: Security of auth flows
- **Data Protection**: Encryption and privacy compliance

## 3. Deployment Strategies

### Development Environment
```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# Run migrations
docker-compose exec backend npm run db:migrate

# Seed database
docker-compose exec backend npm run db:seed
```

### Staging Environment
```bash
# Deploy to staging
kubectl apply -f k8s/staging/

# Run health checks
kubectl get pods -n attendance-staging
kubectl logs -f deployment/backend -n attendance-staging
```

### Production Environment
```bash
# Deploy to production
kubectl apply -f k8s/production/

# Monitor deployment
kubectl rollout status deployment/backend -n attendance-production
kubectl get ingress -n attendance-production
```

## 4. CI/CD Pipeline

### GitHub Actions Workflow
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      # Backend tests
      - name: Backend Tests
        run: |
          cd backend
          npm ci
          npm test
          npm run test:coverage
      
      # Mobile tests
      - name: Mobile Tests
        run: |
          cd mobile
          npm ci
          npm test
      
      # Admin dashboard tests
      - name: Admin Tests
        run: |
          cd admin-dashboard
          npm ci
          npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # Build Docker images
      - name: Build Backend Image
        run: |
          cd backend
          docker build -t attendance-backend:${{ github.sha }} .
      
      - name: Build Admin Image
        run: |
          cd admin-dashboard
          docker build -t attendance-admin:${{ github.sha }} .
      
      # Push to registry
      - name: Push Images
        run: |
          docker push attendance-backend:${{ github.sha }}
          docker push attendance-admin:${{ github.sha }}

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    steps:
      - name: Deploy to Staging
        run: |
          kubectl set image deployment/backend backend=attendance-backend:${{ github.sha }} -n attendance-staging
          kubectl set image deployment/admin-dashboard admin-dashboard=attendance-admin:${{ github.sha }} -n attendance-staging

  deploy-production:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Production
        run: |
          kubectl set image deployment/backend backend=attendance-backend:${{ github.sha }} -n attendance-production
          kubectl set image deployment/admin-dashboard admin-dashboard=attendance-admin:${{ github.sha }} -n attendance-production
```

## 5. Monitoring and Observability

### Application Monitoring
- **Metrics**: Prometheus + Grafana
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **Tracing**: Jaeger for distributed tracing
- **Alerting**: AlertManager for notifications

### Infrastructure Monitoring
- **System Metrics**: Node Exporter
- **Database Monitoring**: PostgreSQL Exporter
- **Cache Monitoring**: Redis Exporter
- **Network Monitoring**: Network monitoring tools

### Mobile App Monitoring
- **Crash Reporting**: Firebase Crashlytics
- **Performance**: Firebase Performance Monitoring
- **Analytics**: Firebase Analytics
- **Remote Config**: Firebase Remote Config

## 6. Backup and Recovery

### Database Backup
```bash
# Automated daily backups
pg_dump -h postgres -U postgres attendance_system > backup_$(date +%Y%m%d).sql

# Point-in-time recovery setup
# Configure WAL archiving for PostgreSQL
```

### File Storage Backup
```bash
# Backup uploaded files
rsync -av /app/uploads/ /backup/uploads/

# Backup face templates
rsync -av /app/face-templates/ /backup/face-templates/
```

### Disaster Recovery Plan
1. **RTO (Recovery Time Objective)**: 4 hours
2. **RPO (Recovery Point Objective)**: 1 hour
3. **Backup Frequency**: Daily full backup, hourly incremental
4. **Recovery Procedures**: Documented step-by-step recovery process

## 7. Security Deployment

### SSL/TLS Configuration
```nginx
server {
    listen 443 ssl http2;
    server_name api.attendance-system.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    
    location / {
        proxy_pass http://backend-service:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Security Headers
```javascript
// Security middleware configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

## 8. Performance Optimization

### Backend Optimization
- **Database Indexing**: Optimize database queries
- **Caching**: Redis for session and data caching
- **Connection Pooling**: Optimize database connections
- **Compression**: Enable gzip compression

### Frontend Optimization
- **Code Splitting**: Lazy load components
- **Image Optimization**: Compress and optimize images
- **CDN**: Use CDN for static assets
- **Caching**: Implement proper caching strategies

### Mobile Optimization
- **Bundle Size**: Optimize app bundle size
- **Image Compression**: Compress face images
- **Offline Storage**: Efficient offline data storage
- **Battery Optimization**: Minimize battery usage

## 9. Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Security scan completed
- [ ] Performance testing done
- [ ] Database migrations ready
- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Monitoring configured
- [ ] Backup procedures tested

### Deployment
- [ ] Deploy to staging environment
- [ ] Run smoke tests
- [ ] Deploy to production
- [ ] Verify all services running
- [ ] Check health endpoints
- [ ] Monitor error rates
- [ ] Validate functionality

### Post-Deployment
- [ ] Monitor system metrics
- [ ] Check application logs
- [ ] Verify user access
- [ ] Test critical workflows
- [ ] Monitor performance
- [ ] Check security alerts
- [ ] Document deployment

## 10. Rollback Procedures

### Quick Rollback
```bash
# Rollback to previous version
kubectl rollout undo deployment/backend -n attendance-production
kubectl rollout undo deployment/admin-dashboard -n attendance-production

# Verify rollback
kubectl rollout status deployment/backend -n attendance-production
```

### Database Rollback
```bash
# Restore database from backup
psql -h postgres -U postgres attendance_system < backup_previous.sql

# Verify data integrity
psql -h postgres -U postgres -c "SELECT COUNT(*) FROM users;" attendance_system
```

This comprehensive testing and deployment framework ensures reliable, secure, and scalable deployment of the face recognition attendance system across all environments.
