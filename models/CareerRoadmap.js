import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const CareerRoadmap = sequelize.define('CareerRoadmap', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  currentRole: {
    type: DataTypes.STRING,
  },
  targetRole: {
    type: DataTypes.STRING,
  },
  experience: {
    type: DataTypes.STRING,
  },
  roadmapData: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  completedSteps: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    defaultValue: [],
  },
}, {
  tableName: 'career_roadmaps',
  timestamps: true,
});

export default CareerRoadmap;
