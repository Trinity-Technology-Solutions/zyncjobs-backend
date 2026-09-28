import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const TrackerRow = sequelize.define('TrackerRow', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  sno: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  subId: {
    type: DataTypes.STRING,
    defaultValue: '',
    field: 'sub_id',
    comment: 'Auto-generated submission ID e.g. SUB-20250115-0042',
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: () => new Date().toISOString().slice(0, 10),
  },
  clientName: { type: DataTypes.STRING, defaultValue: '', field: 'client_name' },
  skillRole: { type: DataTypes.STRING, defaultValue: '', field: 'skill_role' },
  candidateName: { type: DataTypes.STRING, defaultValue: '', field: 'candidate_name' },
  phone: { type: DataTypes.STRING, defaultValue: '' },
  email: { type: DataTypes.STRING, defaultValue: '' },
  recruiterName: { type: DataTypes.STRING, defaultValue: '', field: 'recruiter_name' },
  source: { type: DataTypes.STRING, defaultValue: '' },
  submittedDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'submitted_date' },
  interviewDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'interview_date' },
  status: { type: DataTypes.STRING, defaultValue: '' },
  resumeFile: { type: DataTypes.STRING, defaultValue: '', field: 'resume_file' },
  createdBy: { type: DataTypes.STRING, allowNull: true, field: 'created_by' },
}, {
  tableName: 'tracker_rows',
  timestamps: true,
  underscored: true,
});

export default TrackerRow;
