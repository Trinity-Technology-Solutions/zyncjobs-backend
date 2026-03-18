import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const SkillAssessment = sequelize.define('SkillAssessment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  skill: {
    type: DataTypes.STRING,
    allowNull: false
  },
  score: DataTypes.INTEGER,
  level: DataTypes.STRING,
  questions: DataTypes.JSONB,
  answers: DataTypes.JSONB,
  review: DataTypes.JSONB,
  status: {
    type: DataTypes.STRING,
    defaultValue: 'in_progress'
  },
  completedAt: DataTypes.DATE
}, {
  tableName: 'skill_assessments',
  timestamps: true
});

export default SkillAssessment;
