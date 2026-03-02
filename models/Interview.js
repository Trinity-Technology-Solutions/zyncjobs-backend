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
    type: DataTypes.ENUM('scheduled', 'confirmed', 'rescheduled', 'cancelled', 'completed'),
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
  feedback: DataTypes.JSONB
}, {
  tableName: 'interviews',
  timestamps: true
});

export default Interview;
