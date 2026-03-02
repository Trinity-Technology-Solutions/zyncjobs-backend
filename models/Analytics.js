import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const Analytics = sequelize.define('Analytics', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: DataTypes.STRING,
  userId: DataTypes.UUID,
  eventType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  metadata: DataTypes.JSONB
}, {
  tableName: 'analytics',
  timestamps: true
});

export default Analytics;
