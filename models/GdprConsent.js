import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const GdprConsent = sequelize.define('GdprConsent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.STRING, // supports UUID or email fallback
    allowNull: false
  },
  consentTypes: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  consentDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  // Privacy toggles
  storeResume: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  allowEmployerView: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  receiveJobAlerts: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  allowAIRecommendations: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Cookie consent
  cookieNecessary: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  cookieAnalytics: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  cookieMarketing: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  cookieConsentDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Activity tracking for retention logic
  lastActiveAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  resumeUploadedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  resumeStatus: {
    type: DataTypes.ENUM('active', 'reminded', 'deleted'),
    defaultValue: 'active'
  },
  reminderSentAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'gdpr_consents',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['userId'] },
    { fields: ['lastActiveAt'] },
    { fields: ['resumeStatus'] }
  ]
});

export default GdprConsent;
