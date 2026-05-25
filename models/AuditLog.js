import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  action:     { type: DataTypes.STRING, allowNull: false },
  adminId:    { type: DataTypes.STRING, allowNull: false },
  adminName:  { type: DataTypes.STRING, defaultValue: '' },
  adminEmail: { type: DataTypes.STRING, defaultValue: '' },
  targetId:   { type: DataTypes.STRING, defaultValue: '' },
  targetName: { type: DataTypes.STRING, defaultValue: '' },
  details:    { type: DataTypes.TEXT,   defaultValue: '' },
  ip:         { type: DataTypes.STRING, defaultValue: '' },
}, {
  tableName: 'audit_logs',
  timestamps: true,
  indexes: [
    { fields: ['action'] },
    { fields: ['createdAt'] },
    { fields: ['adminEmail'] },
  ]
});

export default AuditLog;
