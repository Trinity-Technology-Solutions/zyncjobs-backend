import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const CandidateSkill = sequelize.define('CandidateSkill', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  candidateId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  skillId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'candidate_skills',
  timestamps: true,
  indexes: [
    { fields: ['candidateId'] },
    { fields: ['skillId'] },
    { fields: ['candidateId', 'skillId'], unique: true }
  ]
});

export default CandidateSkill;