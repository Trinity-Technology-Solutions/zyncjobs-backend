import { sequelize } from '../config/postgresql.js';

async function fixEnumConflict() {
  try {
    console.log('🔧 Fixing enum type conflict...');

    // Step 1: Drop old enum types
    await sequelize.query('DROP TYPE IF EXISTS verification_status_enum CASCADE;');
    console.log('✅ Dropped old verification_status_enum');

    await sequelize.query('DROP TYPE IF EXISTS "enum_users_verificationStatus" CASCADE;');
    console.log('✅ Dropped old enum_users_verificationStatus');

    // Step 2: Create new enum
    await sequelize.query(`CREATE TYPE verification_status_enum AS ENUM('pending', 'verified', 'rejected');`);
    console.log('✅ Created new enum type');

    // Step 3: Add column with enum type
    await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "verificationStatus" verification_status_enum DEFAULT 'pending';`);
    console.log('✅ Added verificationStatus column');

    // Step 4: Update verified employers
    await sequelize.query(`UPDATE users SET "verificationStatus" = 'verified' WHERE role = 'employer' AND "emailVerified" = true;`);
    console.log('✅ Updated verified employers');

    // Verify
    const [results] = await sequelize.query(`
      SELECT "verificationStatus", COUNT(*) as count
      FROM users 
      GROUP BY "verificationStatus";
    `);
    console.log('\n📊 Verification Status Distribution:');
    console.table(results);

    console.log('\n✅ Enum fix completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing enum:', error.message);
    process.exit(1);
  }
}

fixEnumConflict();
