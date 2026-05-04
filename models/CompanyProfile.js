import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const CompanyProfile = sequelize.define('CompanyProfile', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  companyId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    references: {
      model: 'companies',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  // Branding
  logoUrl: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  coverImageUrl: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  tagline: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Basic Info
  industry: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  companySize: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  foundedYear: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  headquarters: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  // Contact
  website: {
    type: DataTypes.STRING(300),
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  publicEmail: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  // Stats
  rating: {
    type: DataTypes.DECIMAL(2, 1),
    defaultValue: 0
  },
  totalReviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalEmployees: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // JSON Fields
  benefits: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  locations: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  socialLinks: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  keyPeople: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  // Meta
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  profileCompleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  completionPercentage: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'company_profiles',
  timestamps: true
});

export default CompanyProfile;