import bcryptjs from 'bcryptjs';
import { sequelize } from '../config/postgresql.js';
import User from '../models/User.js';

// Import all models to ensure they're registered
import '../models/Job.js';
import '../models/Application.js';
import '../models/Profile.js';
import '../models/Analytics.js';
import '../models/SearchAnalytics.js';
import '../models/Notification.js';
import '../models/Interview.js';
import '../models/JobAlert.js';
import '../models/Message.js';
import '../models/SkillAssessment.js';
import '../models/Resume.js';
import '../models/ResumeVersion.js';
import '../models/SavedCandidate.js';
import '../models/SavedRecommendedJob.js';
import '../models/UserPreferences.js';
import '../models/TeamMember.js';
import '../models/Review.js';
import '../models/Company.js';
import '../models/HeadlineAnalytics.js';
import '../models/PasswordReset.js';
import '../models/Credentialing.js';
import '../models/GdprConsent.js';
import '../models/TalentCandidate.js';

async function setupAdminSystem() {
  try {
    console.log('🚀 Setting up admin management system...');
    
    // 1. Sync database models
    console.log('📊 Syncing database models...');
    await sequelize.sync({ alter: true });
    console.log('✅ Database models synced successfully');

    // 2. Create or update super admin
    console.log('👑 Setting up super admin...');
    
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
    } else {
      // Create new super admin
      const hashedPassword = await bcryptjs.hash('ZyncJobs@2024!', 10);
      
      await User.create({
        name: 'Super Administrator',
        email: 'admin@zyncjobs.com',
        password: hashedPassword,
        role: 'super_admin',
        isActive: true
      });

      console.log('✅ Super admin created successfully');
    }

    console.log('\n🎉 Admin management system setup complete!');
    console.log('\n📋 Super Admin Credentials:');
    console.log('📧 Email: admin@zyncjobs.com');
    console.log('🔑 Password: ZyncJobs@2024!');
    console.log('\n⚠️  IMPORTANT: Please change the password after first login');
    console.log('\n🔐 Super Admin Capabilities:');
    console.log('   • Create and manage other admin accounts');
    console.log('   • Assign admin and super_admin roles');
    console.log('   • Reset admin passwords');
    console.log('   • Delete admin accounts');
    console.log('   • Access all admin dashboard features');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

// Run the setup
setupAdminSystem();