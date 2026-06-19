import { sequelize } from './config/postgresql.js';
import TeamMember from './models/TeamMember.js';
import User from './models/User.js';

async function updateSchema() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    await TeamMember.sync({ alter: true });
    console.log('TeamMember synced with alter: true');
    await User.sync({ alter: true });
    console.log('User synced with alter: true');
    process.exit(0);
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
}

updateSchema();
