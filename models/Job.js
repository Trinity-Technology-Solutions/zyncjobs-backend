import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const Job = sequelize.define('Job', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  employerId: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Unique employer/company identifier (like Dice ID)'
  },
  positionId: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Unique position identifier for this specific job posting'
  },
  jobTitle: {
    type: DataTypes.STRING,
    allowNull: false
  },
  title: DataTypes.STRING,
  company: {
    type: DataTypes.STRING,
    allowNull: false
  },
  companyLogo: DataTypes.STRING,
  jobHeaderImage: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Banner/hero image for job details page'
  },
  location: {
    type: DataTypes.STRING,
    allowNull: false
  },
  jobType: {
    type: DataTypes.ENUM('Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'),
    allowNull: false,
    defaultValue: 'Full-time'
  },
  workSetting: {
    type: DataTypes.ENUM('Remote', 'Hybrid', 'On-site'),
    defaultValue: 'On-site'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  requirements: DataTypes.TEXT,
  responsibilities: DataTypes.TEXT,
  skills: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  salaryMin: DataTypes.INTEGER,
  salaryMax: DataTypes.INTEGER,
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'USD'
  },
  experienceLevel: {
    type: DataTypes.ENUM('Entry', 'Mid', 'Senior', 'Lead'),
    defaultValue: 'Mid'
  },
  jobCategory: {
    type: DataTypes.STRING,
    allowNull: true
  },
  languages: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  experienceRange: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'e.g. 2-5 years'
  },
  country: {
    type: DataTypes.STRING,
    allowNull: true
  },
  latitude: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  longitude: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  employerEmail: {
    type: DataTypes.STRING,
    allowNull: false
  },
  postedBy: DataTypes.STRING,
  companyId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'FK to companies table'
  },
  applicationDeadline: DataTypes.DATE,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'approved'
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  views: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  applicationsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  refreshCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of times this job has been refreshed'
  },
  lastRefreshedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of the last refresh'
  },
  originalPostedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Original posting date (before any refreshes)'
  }
}, {
  tableName: 'jobs',
  timestamps: true,
  indexes: [
    { fields: ['jobTitle'] },
    { fields: ['company'] },
    { fields: ['location'] },
    { fields: ['jobType'] },
    { fields: ['employerEmail'] },
    { fields: ['isActive'] },
    { fields: ['status'] },
    { fields: ['employerId'] },
    { fields: ['positionId'], unique: true },
    { fields: ['isActive', 'status'] },
    { fields: ['createdAt'] },
    { fields: ['slug'] },
    { fields: ['refreshCount'] },
    { fields: ['lastRefreshedAt'] },
    { fields: ['companyId'] }
  ]
});

export default Job;
