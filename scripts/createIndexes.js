import { sequelize } from '../config/postgresql.js';
import dotenv from 'dotenv';
import Job from '../models/Job.js';
import User from '../models/User.js';
import Company from '../models/Company.js';

dotenv.config();

const createIndexes = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connected to PostgreSQL');

    // Sync all models to create indexes
    await Job.sync();
    await User.sync();
    await Company.sync();

    console.log('✓ All indexes created successfully');

  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await sequelize.close();
  }
};

createIndexes();