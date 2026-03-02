import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const Application = sequelize.define('Application', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  jobId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  candidateId: {
    type: DataTypes.UUID,
    allowNull: true  // Allow null for quick apply without login
  },
  employerId: DataTypes.UUID,
  candidateEmail: {
    type: DataTypes.STRING,
    allowNull: false
  },
  candidateName: DataTypes.STRING,
  employerEmail: DataTypes.STRING,
  status: {
    type: DataTypes.ENUM('pending', 'reviewed', 'shortlisted', 'interviewed', 'rejected', 'hired'),
    defaultValue: 'pending'
  },
  coverLetter: DataTypes.TEXT,
  resumeUrl: DataTypes.STRING,
  aiScore: DataTypes.INTEGER,
  aiAnalysis: DataTypes.JSONB
}, {
  tableName: 'applications',
  timestamps: true,
  indexes: [
    { fields: ['jobId'] },
    { fields: ['candidateId'] },
    { fields: ['candidateEmail'] },
    { fields: ['status'] }
  ]
});

export default Application;
