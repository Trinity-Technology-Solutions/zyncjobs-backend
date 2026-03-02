import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const SearchAnalytics = sequelize.define('SearchAnalytics', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: DataTypes.UUID,
  email: DataTypes.STRING,
  searchQuery: DataTypes.STRING,
  location: DataTypes.STRING,
  filters: DataTypes.JSONB,
  resultsCount: DataTypes.INTEGER,
  clickedJobId: DataTypes.UUID
}, {
  tableName: 'search_analytics',
  timestamps: true
});

export default SearchAnalytics;
