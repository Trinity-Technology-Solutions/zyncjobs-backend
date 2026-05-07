import bcryptjs from 'bcryptjs';
import User from '../models/User.js';
import { sequelize } from '../config/postgresql.js';

async function createSuperAdmin() {
  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ 
      where: { email: 'admin@zyncjobs.com' } 
    });

    if (existingSuperAdmin) {
      console.log('ℹ️  Super admin already exists');
      
      // Update role to super_admin if it's not already
      if (existingSuperAdmin.role !== 'super_admin') {
        await existingSuperAdmin.update({ role: 'super_admin' });
        console.log('✅ Updated existing admin to super_admin role');
      }
      
      return;
    }

    // Create super admin
    const hashedPassword = await bcryptjs.hash('ZyncJobs@2024!', 10);
    
    const superAdmin = await User.create({
      name: 'Super Administrator',
      email: 'admin@zyncjobs.com',
      password: hashedPassword,
      role: 'super_admin',
      isActive: true
    });

    console.log('✅ Super admin created successfully');
    console.log('📧 Email: admin@zyncjobs.com');
    console.log('🔑 Password: ZyncJobs@2024!');
    console.log('⚠️  Please change the password after first login');

  } catch (error) {
    console.error('❌ Error creating super admin:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

// Run the script
createSuperAdmin();