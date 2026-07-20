import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const JobAlertNotification = sequelize.define('JobAlertNotification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  candidateId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  alertId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  jobId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  // 'unread' | 'read' | 'dismissed'
  status: {
    type: DataTypes.ENUM('unread', 'read', 'dismissed'),
    defaultValue: 'unread'
  },
  // frequency copied from alert at creation time — used by scheduler
  frequency: {
    type: DataTypes.ENUM('instant', 'daily', 'weekly'),
    allowNull: false
  },
  // true once the email has been dispatched by scheduler or instant send
  emailed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  matchScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  matchedKeywords: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  }
}, {
  tableName: 'job_alert_notifications',
  timestamps: true,
  indexes: [
    // Uniqueness: one notification per candidate+job+alert
    {
      unique: true,
      fields: ['candidateId', 'jobId', 'alertId'],
      name: 'unique_candidate_job_alert'
    },
    { fields: ['candidateId'] },
    { fields: ['alertId'] },
    { fields: ['jobId'] },
    { fields: ['status'] },
    { fields: ['emailed'] },
    { fields: ['frequency'] },
    // Scheduler queries: pending emails by frequency
    { fields: ['frequency', 'emailed'] },
    { fields: ['candidateId', 'status'] },
    { fields: ['createdAt'] }
  ]
});

// Association — required for include: [{ model: Job, as: 'job' }] in service queries
import Job from './Job.js';
JobAlertNotification.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });

export default JobAlertNotification;
