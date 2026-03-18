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
  employerEmail: {
    type: DataTypes.STRING,
    allowNull: false
  },
  postedBy: DataTypes.STRING,
  applicationDeadline: DataTypes.DATE,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'approved'
  },
  views: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  applicationsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
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
    { fields: ['employerId'] },
    { fields: ['positionId'], unique: true }
  ]
});

export default Job;
