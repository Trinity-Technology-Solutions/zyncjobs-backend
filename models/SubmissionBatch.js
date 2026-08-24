import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const SubmissionBatch = sequelize.define('SubmissionBatch', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  batchId: {
    type: DataTypes.STRING(30),
    field: 'batch_id',
    unique: true,
    allowNull: false
  },
  clientName: {
    type: DataTypes.STRING(255),
    field: 'client_name',
    allowNull: false
  },
  jobTitle: {
    type: DataTypes.STRING(255),
    field: 'job_title'
  },
  submittedBy: {
    type: DataTypes.UUID,
    field: 'submitted_by',
    references: { model: 'users', key: 'id' }
  },
  submittedAt: {
    type: DataTypes.DATE,
    field: 'submitted_at',
    defaultValue: DataTypes.NOW
  },
  candidateCount: {
    type: DataTypes.INTEGER,
    field: 'candidate_count',
    defaultValue: 0
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'Submitted'
  },
  notes: DataTypes.TEXT
}, {
  tableName: 'submission_batches',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default SubmissionBatch;