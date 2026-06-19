import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const RecruiterActivityLog = sequelize.define('RecruiterActivityLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  companyId:    { type: DataTypes.STRING, allowNull: false },
  userId:       { type: DataTypes.STRING, allowNull: false },
  userName:     { type: DataTypes.STRING, defaultValue: '' },
  userEmail:    { type: DataTypes.STRING, defaultValue: '' },
  action:       { type: DataTypes.STRING, allowNull: false },
  module:       { type: DataTypes.STRING, defaultValue: 'general' },
  entityType:   { type: DataTypes.STRING, defaultValue: '' },
  entityId:     { type: DataTypes.STRING, defaultValue: '' },
  entityName:   { type: DataTypes.STRING, defaultValue: '' },
  details:      { type: DataTypes.JSONB, defaultValue: {} },
  ip:           { type: DataTypes.STRING, defaultValue: '' },
}, {
  tableName: 'recruiter_activity_logs',
  timestamps: true,
  indexes: [
    { fields: ['companyId'] },
    { fields: ['userId'] },
    { fields: ['action'] },
    { fields: ['createdAt'] },
    { fields: ['companyId', 'createdAt'] },
  ]
});

export default RecruiterActivityLog;
