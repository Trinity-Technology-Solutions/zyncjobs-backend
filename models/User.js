import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { isEmail: true }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('candidate', 'employer', 'admin', 'super_admin'),
    defaultValue: 'candidate'
  },
  employerId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Unique employer identifier for companies/recruiters'
  },
  company: DataTypes.STRING,
  companyName: DataTypes.STRING,
  companyLogo: DataTypes.STRING,
  companyWebsite: DataTypes.STRING,
  phone: DataTypes.STRING,
  location: DataTypes.STRING,
  title: DataTypes.STRING,
  bio: DataTypes.TEXT,
  headline: DataTypes.STRING,
  skills: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  experience: DataTypes.INTEGER,
  education: DataTypes.TEXT,
  certifications: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  languages: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  profilePicture: DataTypes.STRING,
  resumeUrl: DataTypes.STRING,
  linkedinUrl: DataTypes.STRING,
  githubUrl: DataTypes.STRING,
  portfolioUrl: DataTypes.STRING,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  status: {
    type: DataTypes.ENUM('active', 'suspended', 'deleted'),
    defaultValue: 'active',
    allowNull: false,
    comment: 'Account status: active, suspended, or deleted'
  },
  googleId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  linkedinId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  googleMeetAccessToken: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  googleMeetRefreshToken: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastLogin: DataTypes.DATE,
  verificationStatus: {
    type: DataTypes.ENUM('pending', 'pending_admin', 'verified', 'rejected'),
    defaultValue: 'pending',
    allowNull: true
  },
  // New company verification fields
  companyProfile: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Company profile data from verification'
  },
  domainVerificationMethod: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Method used for domain verification'
  },
  verificationRequestedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  verifiedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  verifiedBy: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Admin who verified the user'
  },
  verificationNote: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Notes about verification process'
  },
  gstNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'GST number provided during registration'
  },
  gstVerification: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Surepass GST verification result'
  },
  inviteToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  inviteTokenExpiry: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isFirstLogin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Flag to prompt password change on first login'
  },
  companyDomain: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Company domain extracted from email'
  }
}, {
  tableName: 'users',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['employerId'],
      where: {
        employerId: {
          [Op.ne]: null
        }
      }
    },
    { fields: ['email'] },
    { fields: ['role'] },
    { fields: ['isActive'] }
  ]
});

export default User;
