import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const TrackerInterview = sequelize.define('TrackerInterview', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  submissionId: { type: DataTypes.UUID, allowNull: false, references: { model: 'tracker_rows', key: 'id' }, onDelete: 'CASCADE' },
  createdBy: { type: DataTypes.STRING, allowNull: false },
  candidateName: { type: DataTypes.STRING, allowNull: false },
  candidateEmail: { type: DataTypes.STRING, allowNull: false },
  clientName: { type: DataTypes.STRING, allowNull: false },
  skillRole: { type: DataTypes.STRING, allowNull: false },
  recruiterName: DataTypes.STRING,
  organizerEmail: { type: DataTypes.STRING, allowNull: false },
  interviewerName: { type: DataTypes.STRING, allowNull: false },
  interviewerEmail: { type: DataTypes.STRING, allowNull: false },
  round: { type: DataTypes.STRING, allowNull: false },
  scheduledDate: { type: DataTypes.DATE, allowNull: false },
  duration: { type: DataTypes.INTEGER, allowNull: false },
  timezone: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.STRING, allowNull: false },
  meetingLink: { type: DataTypes.STRING(2048), defaultValue: '' },
  location: { type: DataTypes.STRING(500), defaultValue: '' },
  notes: { type: DataTypes.TEXT, defaultValue: '' },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'scheduled' },
  revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastInvitedAt: DataTypes.DATE,
}, {
  tableName: 'tracker_interviews', timestamps: true,
  indexes: [{ fields: ['submissionId'] }, { fields: ['interviewerEmail', 'scheduledDate'] }, { fields: ['candidateEmail', 'scheduledDate'] }],
});

export default TrackerInterview;
