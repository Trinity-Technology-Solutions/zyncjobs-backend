import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const ResumeVersion = sequelize.define('ResumeVersion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  resumeId: DataTypes.UUID,
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  fileName: DataTypes.STRING,
  fileUrl: DataTypes.STRING,
  parsedData: DataTypes.JSONB,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'resume_versions',
  timestamps: true
});

export default ResumeVersion;
