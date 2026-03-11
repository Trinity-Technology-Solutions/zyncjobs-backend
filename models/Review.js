import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const Review = sequelize.define('Review', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  companyId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  companyName: DataTypes.STRING,
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 5 }
  },
  title: DataTypes.STRING,
  review: DataTypes.TEXT,
  reviewerName: DataTypes.STRING,
  reviewerEmail: DataTypes.STRING,
  reviewerRole: DataTypes.STRING,
  helpful: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'reviews',
  timestamps: true,
  indexes: [
    { fields: ['companyId'] },
    { fields: ['companyName'] }
  ]
});

export default Review;
