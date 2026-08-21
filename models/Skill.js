import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const Skill = sequelize.define('Skill', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'Canonical skill name, e.g. Java, React, PostgreSQL'
  },
  normalizedName: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Lowercase canonical name used for matching, e.g. java'
  }
}, {
  tableName: 'skills',
  timestamps: true,
  indexes: [
    { fields: ['normalizedName'] }
  ]
});

export default Skill;