import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const Interview = sequelize.define('Interview', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  jobId: DataTypes.UUID,
  candidateId: DataTypes.UUID,
  employerId: DataTypes.UUID,
  applicationId: DataTypes.UUID,
  candidateEmail: {
    type: DataTypes.STRING,
    allowNull: false
  },
  candidateName: DataTypes.STRING,
  employerEmail: DataTypes.STRING,
  scheduledDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER,
    defaultValue: 60
  },
  type: {
    type: DataTypes.ENUM('phone', 'video', 'in-person'),
    defaultValue: 'video'
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'confirmed', 'accepted', 'rejected', 'rescheduled', 'cancelled', 'completed'),
    defaultValue: 'scheduled'
  },
  meetingLink: DataTypes.STRING,
  location: DataTypes.STRING,
  notes: DataTypes.TEXT,
  candidateConfirmed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  employerConfirmed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  feedback: DataTypes.JSONB,
  round: {
    type: DataTypes.ENUM('HR', 'Technical', 'Managerial', 'Final'),
    defaultValue: 'HR'
  },
  result: {
    type: DataTypes.ENUM('Pass', 'Fail', 'Pending'),
    defaultValue: 'Pending'
  },
  interviewer: DataTypes.STRING,
  responseToken: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Secure one-time token emailed to the candidate for accept/decline response'
  },
  tokenExpiry: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp after which the invitation token can no longer be used'
  },
  responseAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when the candidate responded to the invitation (accept or decline)'
  },
  acceptedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when the candidate accepted the interview invitation'
  },
  rejectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when the candidate declined the interview invitation'
  },
  candidateResponded: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether the candidate has already responded to this invitation'
  }
}, {
  tableName: 'interviews',
  timestamps: true,
  indexes: [
    { fields: ['candidateEmail'] },
    { fields: ['employerEmail'] },
    { fields: ['candidateId'] },
    { fields: ['employerId'] },
    { fields: ['applicationId'] },
    { fields: ['status'] },
    { fields: ['scheduledDate'] },
    { fields: ['candidateEmail', 'status'] }
  ]
});

export default Interview;
