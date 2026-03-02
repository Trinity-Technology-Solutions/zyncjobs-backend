import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const Profile = sequelize.define('Profile', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: DataTypes.UUID,
  email: DataTypes.STRING,
  name: DataTypes.STRING,
  phone: DataTypes.STRING,
  location: DataTypes.STRING,
  title: DataTypes.STRING,
  yearsExperience: DataTypes.STRING,
  skills: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  experience: DataTypes.TEXT,
  education: DataTypes.TEXT,
  certifications: DataTypes.TEXT,
  workAuthorization: DataTypes.STRING,
  securityClearance: DataTypes.STRING,
  employmentType: DataTypes.STRING,
  resume: DataTypes.JSONB,
  profilePhoto: DataTypes.STRING,
  profileFrame: DataTypes.STRING,
  coverPhoto: DataTypes.STRING,
  bannerPhoto: DataTypes.STRING,
  profileSummary: DataTypes.TEXT,
  employment: DataTypes.TEXT,
  projects: DataTypes.TEXT,
  internships: DataTypes.TEXT,
  languages: DataTypes.TEXT,
  awards: DataTypes.TEXT,
  clubsCommittees: DataTypes.TEXT,
  competitiveExams: DataTypes.TEXT,
  academicAchievements: DataTypes.TEXT,
  companyName: DataTypes.STRING,
  roleTitle: DataTypes.STRING,
  salary: DataTypes.STRING,
  jobType: DataTypes.STRING,
  birthday: DataTypes.DATE,
  gender: DataTypes.STRING,
  college: DataTypes.STRING,
  degree: DataTypes.STRING
}, {
  tableName: 'profiles',
  timestamps: true
});

export default Profile;
