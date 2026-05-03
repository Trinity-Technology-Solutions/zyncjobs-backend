import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const Company = sequelize.define('Company', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  domain: DataTypes.STRING,
  logo: DataTypes.STRING,
  description: DataTypes.TEXT,
  industry: DataTypes.STRING,
  size: DataTypes.STRING,
  website: DataTypes.STRING,
  location: DataTypes.STRING,
  followers: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  // New company verification fields
  verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  gstNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  registrationNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Email of user who created this company entry'
  },
  verificationDocuments: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of document URLs for verification'
  },
  verificationStatus: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected'),
    defaultValue: 'pending'
  },
  verifiedBy: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Admin who verified the company'
  },
  verifiedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Profile completion status
  profileCompleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'companies',
  timestamps: true
});

export default Company;
