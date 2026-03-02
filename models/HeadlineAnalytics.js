import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const HeadlineAnalytics = sequelize.define('HeadlineAnalytics', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  headlineA: DataTypes.STRING,
  headlineB: DataTypes.STRING,
  viewsA: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  viewsB: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  clicksA: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  clicksB: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'headline_analytics',
  timestamps: true
});

export default HeadlineAnalytics;
