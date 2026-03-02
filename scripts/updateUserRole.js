import { sequelize } from '../config/postgresql.js';

const updateUser = async () => {
  try {
    await sequelize.query(
      "UPDATE users SET role = 'employer' WHERE email = 'muthees@trinitetech.com';"
    );
    console.log('✅ User role updated to employer');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

updateUser();
