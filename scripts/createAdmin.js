import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { fileURLToPath } from 'url';
import path from 'path';
import { sequelize } from '../config/postgresql.js';
import User from '../models/User.js';

const DEFAULT_ADMIN_EMAILS = [
  'admin@zyncjobs.com',
  'antony@trinitetech.com'
];

const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@1234';

export const ensureDefaultSuperAdmin = async () => {
  const results = [];

  for (const email of DEFAULT_ADMIN_EMAILS) {
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await User.findOne({
      where: { email: { [Op.iLike]: normalizedEmail } }
    });

    if (existing) {
      const payload = {
        role: 'super_admin',
        isActive: true,
        status: 'active',
        emailVerified: true,
        lastPasswordChange: new Date(),
        passwordExpiryDays: 90,
        mustChangePassword: false,
        passwordHistory: []
      };

      if (existing.role !== 'super_admin' || !existing.isActive || existing.status !== 'active') {
        await existing.update(payload);
      }

      const hashed = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
      if (existing.password !== hashed) {
        await existing.update({ password: hashed, ...payload });
      }

      results.push({ email: normalizedEmail, action: 'updated' });
      console.log(`✅ Default admin ensured: ${normalizedEmail}`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    const user = await User.create({
      name: normalizedEmail.includes('trinitetech') ? 'Antony' : 'Zyncjobs Admin',
      email: normalizedEmail,
      password: hashedPassword,
      role: 'super_admin',
      isActive: true,
      status: 'active',
      emailVerified: true,
      lastPasswordChange: new Date(),
      passwordExpiryDays: 90,
      mustChangePassword: false,
      passwordHistory: []
    });

    results.push({ email: normalizedEmail, action: 'created', id: user.id });
    console.log(`✅ Default admin created: ${normalizedEmail}`);
  }

  return results;
};

const createAdmin = async () => {
  try {
    await sequelize.authenticate();
    const result = await ensureDefaultSuperAdmin();
    console.log('Default admin bootstrap complete:', result);
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to bootstrap default admin:', error);
    await sequelize.close();
    process.exit(1);
  }
};

const isDirectRun = () => {
  const filePath = fileURLToPath(import.meta.url);
  return path.resolve(process.argv[1] || '') === path.resolve(filePath);
};

if (isDirectRun()) {
  createAdmin();
}
