import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const JobAlert = sequelize.define('JobAlert', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  keywords: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  location: DataTypes.STRING,
  jobType: DataTypes.STRING,
  experienceLevel: DataTypes.STRING,
  frequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'instant'),
    defaultValue: 'daily'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastSent: DataTypes.DATE
}, {
  tableName: 'job_alerts',
  timestamps: true
});

export default JobAlert;
