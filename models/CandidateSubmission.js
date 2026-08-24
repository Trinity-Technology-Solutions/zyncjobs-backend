import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const CandidateSubmission = sequelize.define('CandidateSubmission', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  batchId: {
    type: DataTypes.UUID,
    field: 'batch_id',
    allowNull: false,
    references: { model: 'submission_batches', key: 'id' }
  },
  candidateId: {
    type: DataTypes.STRING(20),
    field: 'candidate_id',
    allowNull: false,
    references: { model: 'talent_candidates', key: 'candidate_id' }
  },
  candidateName: {
    type: DataTypes.STRING(255),
    field: 'candidate_name'
  },
  candidateEmail: {
    type: DataTypes.STRING(255),
    field: 'candidate_email'
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'submitted'
  },
  submittedAt: {
    type: DataTypes.DATE,
    field: 'submitted_at',
    defaultValue: DataTypes.NOW
  },
  shortlistedAt: {
    type: DataTypes.DATE,
    field: 'shortlisted_at'
  },
  rejectedAt: {
    type: DataTypes.DATE,
    field: 'rejected_at'
  },
  notes: DataTypes.TEXT
}, {
  tableName: 'candidate_submissions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['batch_id', 'candidate_id'] }
  ]
});

export default CandidateSubmission;