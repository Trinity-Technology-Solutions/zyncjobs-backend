import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const TeamMember = sequelize.define('TeamMember', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  employerId: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Email of the employer who owns this team'
  },
  memberEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isEmail: true }
  },
  memberName: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: ''
  },
  role: {
    type: DataTypes.ENUM('Owner', 'Recruiter', 'Viewer'),
    defaultValue: 'Recruiter'
  },
  status: {
    type: DataTypes.ENUM('active', 'pending'),
    defaultValue: 'pending'
  },
  inviteToken: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  inviteExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'team_members',
  timestamps: true,
  indexes: [
    { fields: ['employerId'] },
    { unique: true, fields: ['employerId', 'memberEmail'] },
    { fields: ['inviteToken'] }
  ]
});

export default TeamMember;
