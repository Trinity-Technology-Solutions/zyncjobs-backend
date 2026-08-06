import pg from 'pg';
import dotenv from 'dotenv';
import { sequelize } from '../config/postgresql.js';
import { migrateJobTypeEnum } from './migrateJobTypeEnum.js';

dotenv.config();

const { Client } = pg;

const DB_NAME = process.env.DB_NAME || 'zyncjobs';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT) || 5432;

const createDatabase = async () => {
  const adminClient = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: process.env.DB_ADMIN_USER || DB_USER,
    password: process.env.DB_ADMIN_PASSWORD || DB_PASSWORD,
    database: 'postgres'
  });

  try {
    await adminClient.connect();

    const result = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [DB_NAME]
    );

    if (result.rowCount === 0) {
      await adminClient.query(
        `CREATE DATABASE "${DB_NAME}" ENCODING 'UTF8' TEMPLATE template0`
      );
      console.log(`✅ Database "${DB_NAME}" created`);
    } else {
      console.log(`ℹ️ Database "${DB_NAME}" already exists`);
    }

    await adminClient.end();
  } catch (error) {
    console.error('❌ Failed to create database:', error.message);
    await adminClient.end();
    process.exit(1);
  }

  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    await migrateJobTypeEnum();

    await sequelize.sync({ alter: true });
    console.log('✅ All models synced successfully');

    await sequelize.close();
    console.log('✅ Database setup complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    await sequelize.close();
    process.exit(1);
  }
};

createDatabase();