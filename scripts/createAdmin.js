import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { fileURLToPath } from 'url';
import path from 'path';
import { sequelize } from '../config/postgresql.js';
import User from '../models/User.js';

const DEFAULT_ADMIN_EMAIL = 'admin@zyncjobs.com';

export const ensureDefaultSuperAdmin = async () => {
  const email = DEFAULT_ADMIN_EMAIL;
  const existing = await User.findOne({
    where: { email: { [Op.iLike]: email } },
    attributes: ['id'],
  });
  if (existing) return [{ email, action: 'unchanged', id: existing.id }];

  const password = process.env.DEFAULT_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('Set DEFAULT_ADMIN_PASSWORD to provision the default admin for the first time.');
  }

  const [user, created] = await User.findOrCreate({
    where: { email },
    defaults: {
      name: 'Zyncjobs Admin',
      password: await bcrypt.hash(password, 10),
      role: 'super_admin',
      isActive: true,
      status: 'active',
      emailVerified: true,
      lastPasswordChange: new Date(),
      passwordExpiryDays: 90,
      mustChangePassword: false,
      passwordHistory: [],
    },
  });
  return [{ email, action: created ? 'created' : 'unchanged', id: user.id }];
};

export const createAdmin = async () => {
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
