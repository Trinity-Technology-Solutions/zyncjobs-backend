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
    type: DataTypes.ENUM('pending', 'applied', 'reviewed', 'shortlisted', 'interviewed', 'rejected', 'hired', 'withdrawn'),
    defaultValue: 'pending'
  },
  coverLetter: DataTypes.TEXT,
  resumeUrl: DataTypes.STRING,
  aiScore: DataTypes.INTEGER,
  aiAnalysis: DataTypes.JSONB,
  aiSuggestion: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  employerConfirmedRejection: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  candidatePhone: DataTypes.STRING,
  isQuickApply: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  withdrawnAt: DataTypes.DATE,
  withdrawalReason: DataTypes.STRING,
  timeline: DataTypes.JSONB,
  skills: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  resumeSkills: {
    type: DataTypes.JSONB,
    defaultValue: []
  }
}, {
  tableName: 'applications',
  timestamps: true,
  indexes: [
    { fields: ['jobId'] },
    { fields: ['candidateId'] },
    { fields: ['candidateEmail'] },
    { fields: ['employerEmail'] },
    { fields: ['status'] },
    { fields: ['employerEmail', 'status'] },
    { fields: ['candidateEmail', 'status'] }
  ]
});

export default Application;
