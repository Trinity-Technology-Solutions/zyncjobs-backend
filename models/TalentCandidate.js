import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const TalentCandidate = sequelize.define('TalentCandidate', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  candidateId: {
    type: DataTypes.STRING(20),
    field: 'candidate_id',
    unique: true,
    allowNull: false
  },
  name: { type: DataTypes.STRING, defaultValue: '' },
  email: { type: DataTypes.STRING, defaultValue: '' },
  phone: { type: DataTypes.STRING, defaultValue: '' },
  gender: { type: DataTypes.STRING, defaultValue: '' },
  dob: { type: DataTypes.STRING, defaultValue: '' },
  skills: { type: DataTypes.TEXT, defaultValue: '' },
  experience: { type: DataTypes.STRING, defaultValue: '' },
  totalExperience: { type: DataTypes.FLOAT, allowNull: true },
  jobTitle: { type: DataTypes.STRING, defaultValue: '' },
  currentCompany: { type: DataTypes.STRING, defaultValue: '' },
  summary: { type: DataTypes.TEXT, defaultValue: '' },
  location: { type: DataTypes.STRING, defaultValue: '' },
  country: { type: DataTypes.STRING, defaultValue: '' },
  tools: { type: DataTypes.TEXT, defaultValue: '' },
  softSkills: { type: DataTypes.TEXT, defaultValue: '' },
  workExperiences: { type: DataTypes.TEXT, defaultValue: '[]' },
  internships: { type: DataTypes.TEXT, defaultValue: '[]' },
  languages: { type: DataTypes.TEXT, defaultValue: '' },
  awards: { type: DataTypes.TEXT, defaultValue: '[]' },
  educations: { type: DataTypes.TEXT, defaultValue: '[]' },
  projects: { type: DataTypes.TEXT, defaultValue: '[]' },
  certifications: { type: DataTypes.TEXT, defaultValue: '[]' },
  resumePath: { type: DataTypes.STRING },
  resumeFile: { type: DataTypes.STRING },
  resumeOriginalName: { type: DataTypes.STRING, defaultValue: '' },
  resumeType: { type: DataTypes.STRING, defaultValue: '' },
  resumeSize: { type: DataTypes.BIGINT, defaultValue: 0 },
  status: { type: DataTypes.STRING, defaultValue: 'Parsed' },
  parserStatus: { type: DataTypes.STRING, defaultValue: 'Pending' },
  parserError: { type: DataTypes.TEXT, defaultValue: '' },
  retryCount: { type: DataTypes.INTEGER, defaultValue: 0 },
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
