import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const CandidateNote = sequelize.define('CandidateNote', {
  id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  applicationId:  { type: DataTypes.STRING, allowNull: false },
  candidateEmail: { type: DataTypes.STRING, allowNull: false },
  candidateName:  { type: DataTypes.STRING, defaultValue: '' },
  companyId:      { type: DataTypes.STRING, allowNull: false },
  recruiterId:    { type: DataTypes.STRING, allowNull: false },
  recruiterName:  { type: DataTypes.STRING, defaultValue: '' },
  noteType:       {
    type: DataTypes.ENUM('call','email','interview','note','status_change','offer'),
    defaultValue: 'note'
  },
  content:        { type: DataTypes.TEXT, allowNull: false },
}, {
  tableName: 'candidate_notes',
  timestamps: true,
  indexes: [
    { fields: ['applicationId'] },
    { fields: ['candidateEmail'] },
    { fields: ['recruiterId'] },
    { fields: ['companyId'] },
    { fields: ['createdAt'] },
  ]
});

export default CandidateNote;
