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
  alertName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // --- Matching criteria ---
  keywords: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  location: DataTypes.STRING,
  country: DataTypes.STRING,
  jobType: DataTypes.STRING,
  workSetting: DataTypes.STRING,       // Remote | Hybrid | On-site
  experienceLevel: DataTypes.STRING,
  jobCategory: DataTypes.STRING,
  salaryMin: DataTypes.INTEGER,
  // --- Alert config ---
  frequency: {
    type: DataTypes.ENUM('instant', 'daily', 'weekly'),
    defaultValue: 'daily'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastSent: DataTypes.DATE
}, {
  tableName: 'job_alerts',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['email'] },
    { fields: ['isActive'] },
    { fields: ['isActive', 'frequency'] }
  ]
});

export default JobAlert;
