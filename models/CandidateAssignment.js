import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const CandidateAssignment = sequelize.define('CandidateAssignment', {
  id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  applicationId:   { type: DataTypes.STRING, allowNull: false },
  candidateEmail:  { type: DataTypes.STRING, allowNull: false },
  candidateName:   { type: DataTypes.STRING, defaultValue: '' },
  jobId:           { type: DataTypes.STRING, defaultValue: '' },
  jobTitle:        { type: DataTypes.STRING, defaultValue: '' },
  companyId:       { type: DataTypes.STRING, allowNull: false },
  recruiterId:     { type: DataTypes.STRING, allowNull: false },
  recruiterName:   { type: DataTypes.STRING, defaultValue: '' },
  recruiterEmail:  { type: DataTypes.STRING, defaultValue: '' },
  assignedBy:      { type: DataTypes.STRING, defaultValue: '' },
  assignedByName:  { type: DataTypes.STRING, defaultValue: '' },
  pipelineStage:   {
    type: DataTypes.ENUM('Applied','Screening','Shortlisted','Interview 1','Interview 2','Selected','Offer','Joined','Rejected'),
    defaultValue: 'Applied'
  },
  notes:           { type: DataTypes.TEXT, defaultValue: '' },
  isActive:        { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'candidate_assignments',
  timestamps: true,
  indexes: [
    { fields: ['applicationId'] },
    { fields: ['recruiterId'] },
    { fields: ['companyId'] },
    { fields: ['candidateEmail'] },
    { fields: ['pipelineStage'] },
  ]
});

export default CandidateAssignment;
