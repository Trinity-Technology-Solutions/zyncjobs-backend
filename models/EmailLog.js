import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const EmailLog = sequelize.define('EmailLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  userType: {
    type: DataTypes.STRING,
    defaultValue: 'both'
  },
  recipients: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  sent: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  failed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending'
  },
  error: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  adminId: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  adminEmail: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  sentAt: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'email_logs',
  timestamps: true,
  indexes: [
    { fields: ['status'] },
    { fields: ['createdAt'] },
    { fields: ['userType'] }
  ]
});

export default EmailLog;
