import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

// Archive table — stores a snapshot of user data before account deletion.
// This is for internal records only. The user's active account is fully removed.
const DeletedUser = sequelize.define('DeletedUser', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  originalUserId: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: 'The original user ID before deletion'
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name: DataTypes.STRING,
  role: DataTypes.STRING,
  phone: DataTypes.STRING,
  location: DataTypes.STRING,
  deletionReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  deletedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  // Full snapshots stored as JSONB for internal records
  userSnapshot: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Full user row snapshot at time of deletion'
  },
  profileSnapshot: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Full profile row snapshot at time of deletion'
  },
  resumeSnapshot: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Resume metadata snapshot (not the file itself)'
  },
  applicationCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of applications at time of deletion'
  }
}, {
  tableName: 'deleted_users',
  timestamps: true,
  indexes: [
    { fields: ['email'] },
    { fields: ['originalUserId'] },
    { fields: ['deletedAt'] }
  ]
});

export default DeletedUser;
