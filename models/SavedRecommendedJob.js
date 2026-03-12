import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const SavedRecommendedJob = sequelize.define('SavedRecommendedJob', {
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
  jobId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // Job details (denormalized for performance)
  jobTitle: {
    type: DataTypes.STRING,
    allowNull: false
  },
  company: {
    type: DataTypes.STRING,
    allowNull: false
  },
  location: DataTypes.STRING,
  salary: DataTypes.STRING,
  jobType: DataTypes.STRING,
  skills: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  description: DataTypes.TEXT,
  matchPercentage: DataTypes.INTEGER,
  matchingSkills: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  savedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'saved_recommended_jobs',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'jobId'] // Prevent duplicate saves
    },
    {
      fields: ['userEmail']
    },
    {
      fields: ['savedAt']
    }
  ]
});

export default SavedRecommendedJob;