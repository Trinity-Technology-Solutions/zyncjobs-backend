import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const TrackerRow = sequelize.define('TrackerRow', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  sno: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  clientName: { type: DataTypes.STRING, defaultValue: '', field: 'client_name' },
  skillRole: { type: DataTypes.STRING, defaultValue: '', field: 'skill_role' },
  candidateName: { type: DataTypes.STRING, defaultValue: '', field: 'candidate_name' },
  phone: { type: DataTypes.STRING, defaultValue: '' },
  email: { type: DataTypes.STRING, defaultValue: '' },
  recruiterName: { type: DataTypes.STRING, defaultValue: '', field: 'recruiter_name' },
  status: { type: DataTypes.STRING, defaultValue: '' },
  resumeFile: { type: DataTypes.STRING, defaultValue: '', field: 'resume_file' },
  createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by' },
}, {
  tableName: 'tracker_rows',
  timestamps: true,
  underscored: true,
});

export default TrackerRow;
