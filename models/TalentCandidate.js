import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const TalentCandidate = sequelize.define('TalentCandidate', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  name: { type: DataTypes.STRING, defaultValue: '' },
  email: { type: DataTypes.STRING, defaultValue: '' },
  phone: { type: DataTypes.STRING, defaultValue: '' },
  skills: { type: DataTypes.TEXT, defaultValue: '' },
  experience: { type: DataTypes.STRING, defaultValue: '' },
  jobTitle: { type: DataTypes.STRING, defaultValue: '' },
  summary: { type: DataTypes.TEXT, defaultValue: '' },
  location: { type: DataTypes.STRING, defaultValue: '' },
  country: { type: DataTypes.STRING, defaultValue: '' },
  tools: { type: DataTypes.TEXT, defaultValue: '' },
  softSkills: { type: DataTypes.TEXT, defaultValue: '' },
  workExperiences: { type: DataTypes.TEXT, defaultValue: '[]' },
  educations: { type: DataTypes.TEXT, defaultValue: '[]' },
  projects: { type: DataTypes.TEXT, defaultValue: '[]' },
  certifications: { type: DataTypes.TEXT, defaultValue: '[]' },
  resumePath: { type: DataTypes.STRING },
  resumeFile: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'Parsed' },
  source: { type: DataTypes.STRING, defaultValue: 'uploaded_resume' },
  isRegistered: { type: DataTypes.BOOLEAN, defaultValue: false },
  isVisible: { type: DataTypes.BOOLEAN, defaultValue: false },
  emailStatus: { type: DataTypes.STRING, defaultValue: 'Not Sent' },
  emailSentAt: { type: DataTypes.DATE, allowNull: true },
  addedDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  rawText: { type: DataTypes.TEXT, defaultValue: '' }
}, {
  tableName: 'talent_candidates',
  timestamps: false
});

export default TalentCandidate;
