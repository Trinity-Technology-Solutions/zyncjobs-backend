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
  location: DataTypes.STRING
}, {
  tableName: 'companies',
  timestamps: true
});

export default Company;
