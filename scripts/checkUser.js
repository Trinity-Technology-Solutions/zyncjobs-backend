import { sequelize } from '../config/postgresql.js';

const checkUser = async () => {
  try {
    const [results] = await sequelize.query(
      "SELECT email, role FROM users WHERE email = 'muthees@trinitetech.com';"
    );
    console.log('User data:', results);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

checkUser();
