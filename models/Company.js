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
  
  // Enhanced company profile fields
  tagline: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Company tagline or slogan'
  },
  foundedYear: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Year company was founded'
  },
  companyType: {
    type: DataTypes.STRING,
    defaultValue: 'Private',
    comment: 'Type of company'
  },
  companySize: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Number of employees range'
  },
  headquarters: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Main office location'
  },
  companyWebsite: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Official company website'
  },
  benefits: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of employee benefits'
  },
  socialLinks: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Social media links (linkedin, twitter, facebook)'
  },
  additionalLocations: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of additional office locations'
  },
  cinNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Corporate Identification Number'
  },
  companyEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Official company email'
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Company phone number'
  },
  companyPhotos: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of company photo URLs'
  },
  
  followers: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  // Company verification fields
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
