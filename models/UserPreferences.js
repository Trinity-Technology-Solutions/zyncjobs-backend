import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const UserPreferences = sequelize.define('UserPreferences', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  userEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isEmail: true }
  },
  // Resume skills from uploaded resume
  resumeSkills: {
    type: DataTypes.ARRAY(DataTypes.JSONB),
    defaultValue: []
  },
  // Search history
  searchHistory: {
    type: DataTypes.ARRAY(DataTypes.JSONB),
    defaultValue: []
  },
  // Saved job searches
  savedSearches: {
    type: DataTypes.ARRAY(DataTypes.JSONB),
    defaultValue: []
  },
  // Job preferences
  jobPreferences: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  // Location preferences
  locationPreferences: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  // Salary preferences
  salaryPreferences: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  // Notification preferences
  notificationPreferences: {
    type: DataTypes.JSONB,
    defaultValue: {
      emailNotifications: true,
      jobAlerts: true,
      applicationUpdates: true
    }
  },
  // Other preferences
  otherPreferences: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'user_preferences',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId'] // One preference record per user
    },
    {
      fields: ['userEmail']
    }
  ]
});

export default UserPreferences;