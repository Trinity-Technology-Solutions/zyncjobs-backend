import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const SavedCandidate = sequelize.define('SavedCandidate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  employerId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  employerEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isEmail: true }
  },
  candidateId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  // Candidate details (denormalized for performance)
  candidateName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  candidateEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isEmail: true }
  },
  candidateTitle: DataTypes.STRING,
  candidateLocation: DataTypes.STRING,
  candidatePhone: DataTypes.STRING,
  candidateHeadline: DataTypes.STRING,
  candidateBio: DataTypes.TEXT,
  candidateSkills: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  candidateExperience: DataTypes.INTEGER,
  candidateEducation: DataTypes.TEXT,
  candidateProfilePicture: DataTypes.STRING,
  candidateResumeUrl: DataTypes.STRING,
  candidateLinkedinUrl: DataTypes.STRING,
  candidateGithubUrl: DataTypes.STRING,
  candidatePortfolioUrl: DataTypes.STRING,
  // Company details
  companyName: DataTypes.STRING,
  companyLogo: DataTypes.STRING,
  appliedJobTitle: DataTypes.STRING,
  appliedJobId: DataTypes.UUID,
  // Additional metadata
  notes: DataTypes.TEXT, // Employer's private notes about the candidate
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  savedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'saved_candidates',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['employerId', 'candidateId']
    },
    {
      unique: true,
      fields: ['employerId', 'candidateEmail']
    },
    {
      fields: ['employerEmail']
    },
    {
      fields: ['savedAt']
    }
  ]
});

export default SavedCandidate;