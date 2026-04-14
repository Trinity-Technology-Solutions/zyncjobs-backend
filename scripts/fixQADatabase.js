import { sequelize } from '../config/postgresql.js';

async function fixQADatabase() {
  try {
    console.log('🔧 Fixing QA database enum issues...');

    // Fix gdpr_consents table enum issue
    console.log('Fixing gdpr_consents resumeStatus column...');
    
    // Drop the default constraint first
    await sequelize.query(`
      ALTER TABLE gdpr_consents 
      ALTER COLUMN "resumeStatus" DROP DEFAULT;
    `).catch(e => console.log('No default to drop:', e.message));

    // Drop the column if it exists
    await sequelize.query(`
      ALTER TABLE gdpr_consents 
      DROP COLUMN IF EXISTS "resumeStatus";
    `);
    console.log('✅ Dropped resumeStatus column');

    // Drop the old enum type if it exists
    await sequelize.query(`
      DROP TYPE IF EXISTS "enum_gdpr_consents_resumeStatus" CASCADE;
    `);
    console.log('✅ Dropped old enum type');

    // Create the new enum type
    await sequelize.query(`
      CREATE TYPE "enum_gdpr_consents_resumeStatus" AS ENUM('active', 'reminded', 'deleted');
    `);
    console.log('✅ Created new enum type');

    // Add the column back with the correct type
    await sequelize.query(`
      ALTER TABLE gdpr_consents 
      ADD COLUMN "resumeStatus" "enum_gdpr_consents_resumeStatus" DEFAULT 'active';
    `);
    console.log('✅ Added resumeStatus column with correct type');

    // Now add missing columns to jobs table
    console.log('\n🔧 Adding missing columns to jobs table...');
    
    await sequelize.query(`
      ALTER TABLE jobs 
      ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
    `);
    console.log('✅ Added views column');

    await sequelize.query(`
      ALTER TABLE jobs 
      ADD COLUMN IF NOT EXISTS "applicationsCount" INTEGER DEFAULT 0;
    `);
    console.log('✅ Added applicationsCount column');

    await sequelize.query(`
      ALTER TABLE jobs 
      ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
    `);
    console.log('✅ Added slug column');

    await sequelize.query(`
      ALTER TABLE jobs 
      ADD COLUMN IF NOT EXISTS "jobHeaderImage" VARCHAR(255);
    `);
    console.log('✅ Added jobHeaderImage column');

    // Update NULL values to defaults
    await sequelize.query(`
      UPDATE jobs 
      SET views = 0 
      WHERE views IS NULL;
    `);

    await sequelize.query(`
      UPDATE jobs 
      SET "applicationsCount" = 0 
      WHERE "applicationsCount" IS NULL;
    `);
    console.log('✅ Updated NULL values to defaults');

    console.log('\n✅ QA database fixed successfully!');
    console.log('Now you can run: npm run db:sync');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

fixQADatabase();
