import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const RefreshSession = sequelize.define('RefreshSession', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tokenHash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: 'SHA-256 hash of the refresh token (plain token is never stored)'
  },
  ip: DataTypes.STRING,
  userAgent: DataTypes.STRING,
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  revokedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'refresh_sessions',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['tokenHash'], unique: true },
    { fields: ['revokedAt'] },
    { fields: ['expiresAt'] }
  ]
});

export default RefreshSession;