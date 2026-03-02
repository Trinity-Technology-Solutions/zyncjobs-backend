import { DataTypes } from 'sequelize';
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
    type: DataTypes.ENUM('candidate', 'employer', 'admin'),
    defaultValue: 'candidate'
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
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastLogin: DataTypes.DATE
}, {
  tableName: 'users',
  timestamps: true
});

export default User;
