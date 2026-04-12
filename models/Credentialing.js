import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const Credentialing = sequelize.define('Credentialing', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  employerEmail: { type: DataTypes.STRING, allowNull: false },
  candidateName: { type: DataTypes.STRING, allowNull: false },
  candidateEmail: { type: DataTypes.STRING, allowNull: false },
  jobTitle: { type: DataTypes.STRING, defaultValue: 'Position' },
  applicationId: { type: DataTypes.UUID, allowNull: true },
  verificationStatus: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected'),
    defaultValue: 'pending'
  },
  onboardingStatus: {
    type: DataTypes.ENUM('not-started', 'in-progress', 'completed'),
    defaultValue: 'not-started'
  },
  onboardingChecklist: { type: DataTypes.JSONB, defaultValue: [] },
  billingRate: { type: DataTypes.FLOAT, defaultValue: 0 },
  totalHours: { type: DataTypes.FLOAT, defaultValue: 0 },
  timesheets: { type: DataTypes.JSONB, defaultValue: [] },
  invoices: { type: DataTypes.JSONB, defaultValue: [] },
}, {
  tableName: 'credentialing',
  timestamps: true,
  indexes: [
    { fields: ['employerEmail'] },
    { fields: ['candidateEmail'] },
    { fields: ['verificationStatus'] },
  ]
});

export default Credentialing;
