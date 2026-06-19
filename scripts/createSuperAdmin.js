import bcrypt from 'bcryptjs';
import { sequelize } from '../config/postgresql.js';
import User from '../models/User.js';

const createSuperAdmin = async () => {
  try {
    const name = 'Antony';
    const email = 'antony@trinitetech.com';
    const password = 'Admin@1234';
    const role = 'super_admin';

    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      console.log(`User ${email} already exists with role: ${existing.role}`);
      console.log('Upgrading to super_admin...');
      const hashedPassword = await bcrypt.hash(password, 10);
      await existing.update({
        role,
        password: hashedPassword,
        isActive: true,
        status: 'active',
        emailVerified: true
      });
      console.log('Upgraded to super_admin successfully!');
      console.log('Email:', email);
      console.log('Password:', password);
      console.log('Role:', role);
      await sequelize.close();
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role,
      isActive: true,
      status: 'active',
      emailVerified: true
    });

    console.log('Super admin created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role:', role);

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to create super admin:', error);
    await sequelize.close();
    process.exit(1);
  }
};

createSuperAdmin();
