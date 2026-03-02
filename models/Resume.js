import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const Resume = sequelize.define('Resume', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  email: DataTypes.STRING,
  fileName: DataTypes.STRING,
  fileUrl: DataTypes.STRING,
  fileSize: DataTypes.INTEGER,
  parsedData: DataTypes.JSONB,
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending'
  },
  moderationNotes: DataTypes.TEXT,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'resumes',
  timestamps: true
});

export default Resume;
