import bcrypt from 'bcryptjs';
import { sequelize } from '../config/postgresql.js';
import User from '../models/User.js';

const createEmployer = async () => {
  try {
    const name = 'Muthees';
    const email = 'muthees@trinitetech.com';
    const password = 'Mutheesraina@3';
    const company = 'trinitetech.com';
    const companyName = 'Trinitech';

    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      console.log(`User ${email} already exists. Updating credentials...`);
      const hashedPassword = await bcrypt.hash(password, 10);
      await existing.update({
        password: hashedPassword,
        role: 'employer',
        isActive: true,
        status: 'active',
        emailVerified: true,
        verificationStatus: 'verified',
        company,
        companyName,
        name,
        lastPasswordChange: new Date(),
        passwordHistory: [],
        failedLoginAttempts: 0,
        accountLockedUntil: null,
      });
      console.log('Employer updated successfully!');
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      await User.create({
        name,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: 'employer',
        company,
        companyName,
        isActive: true,
        status: 'active',
        emailVerified: true,
        verificationStatus: 'verified',
        plan: 'free',
        lastPasswordChange: new Date(),
        passwordHistory: [],
        companyDomain: 'trinitetech.com',
      });
      console.log('Employer created successfully!');
    }

    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role: employer');
    console.log('Verification: verified');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to create employer:', error);
    await sequelize.close();
    process.exit(1);
  }
};

createEmployer();
