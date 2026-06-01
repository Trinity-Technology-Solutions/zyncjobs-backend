import { sequelize } from '../config/postgresql.js';
import { QueryTypes } from 'sequelize';

/**
 * Migration script to add new columns for team invitation system
 * Run this script to add missing columns to the users table
 */

async function migrateTeamInvitationColumns() {
  try {
    console.log('🔄 Starting team invitation columns migration...');

    // Check if columns already exist
    const tableInfo = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'public'",
      { type: QueryTypes.SELECT }
    );
    
    const existingColumns = tableInfo.map(row => row.column_name);
    console.log('📋 Existing columns:', existingColumns);

    // Add isFirstLogin column if it doesn't exist
    if (!existingColumns.includes('isFirstLogin')) {
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN "isFirstLogin" BOOLEAN DEFAULT false;
      `);
      console.log('✅ Added isFirstLogin column');
    } else {
      console.log('ℹ️ isFirstLogin column already exists');
    }

    // Add companyDomain column if it doesn't exist
    if (!existingColumns.includes('companyDomain')) {
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN "companyDomain" VARCHAR(255);
      `);
      console.log('✅ Added companyDomain column');
    } else {
      console.log('ℹ️ companyDomain column already exists');
    }

    // Update existing users to set isFirstLogin = false (they're not first-time users)
    await sequelize.query(`
      UPDATE users 
      SET "isFirstLogin" = false 
      WHERE "isFirstLogin" IS NULL;
    `);
    console.log('✅ Updated existing users isFirstLogin to false');

    // Update companyDomain for existing users based on their email
    await sequelize.query(`
      UPDATE users 
      SET "companyDomain" = SPLIT_PART(email, '@', 2)
      WHERE "companyDomain" IS NULL AND email IS NOT NULL;
    `);
    console.log('✅ Updated existing users companyDomain from email');

    console.log('🎉 Team invitation columns migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateTeamInvitationColumns()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

export { migrateTeamInvitationColumns };