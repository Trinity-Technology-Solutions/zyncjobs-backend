import { sequelize } from '../config/postgresql.js';

const clearUsers = async () => {
  try {
    await sequelize.query('DELETE FROM users;');
    console.log('✅ All users deleted successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

clearUsers();
