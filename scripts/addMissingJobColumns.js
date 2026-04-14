import { sequelize } from '../config/postgresql.js';

async function addMissingJobColumns() {
  try {
    console.log('🔧 Adding missing columns to jobs table...');
    console.log('Database:', process.env.DB_NAME);

    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Add views column
    try {
      await sequelize.query(`
        ALTER TABLE jobs 
        ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
      `);
      console.log('✅ Added/verified views column');
    } catch (e) {
      console.log('⚠️  views column:', e.message);
    }

    // Add applicationsCount column
    try {
      await sequelize.query(`
        ALTER TABLE jobs 
        ADD COLUMN IF NOT EXISTS "applicationsCount" INTEGER DEFAULT 0;
      `);
      console.log('✅ Added/verified applicationsCount column');
    } catch (e) {
      console.log('⚠️  applicationsCount column:', e.message);
    }

    // Add slug column
    try {
      await sequelize.query(`
        ALTER TABLE jobs 
        ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
      `);
      console.log('✅ Added/verified slug column');
    } catch (e) {
      console.log('⚠️  slug column:', e.message);
    }

    // Add jobHeaderImage column
    try {
      await sequelize.query(`
        ALTER TABLE jobs 
        ADD COLUMN IF NOT EXISTS "jobHeaderImage" VARCHAR(255);
      `);
      console.log('✅ Added/verified jobHeaderImage column');
    } catch (e) {
      console.log('⚠️  jobHeaderImage column:', e.message);
    }

    // Update NULL values
    await sequelize.query(`
      UPDATE jobs 
      SET views = COALESCE(views, 0),
          "applicationsCount" = COALESCE("applicationsCount", 0)
      WHERE views IS NULL OR "applicationsCount" IS NULL;
    `);
    console.log('✅ Updated NULL values to defaults');

    // Verify columns exist
    const [columns] = await sequelize.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'jobs'
      AND column_name IN ('views', 'applicationsCount', 'slug', 'jobHeaderImage')
      ORDER BY column_name;
    `);

    console.log('\n📊 Job table columns:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (default: ${col.column_default || 'none'})`);
    });

    console.log('\n✅ Migration completed successfully!');
    console.log('You can now restart your server.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

addMissingJobColumns();
