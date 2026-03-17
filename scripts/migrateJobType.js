import { sequelize } from '../config/postgresql.js';

try {
  const [colInfo] = await sequelize.query(
    "SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='jobs' AND column_name='jobType'"
  );
  console.log('Current column:', JSON.stringify(colInfo));

  if (colInfo[0]?.data_type === 'ARRAY' || colInfo[0]?.udt_name === '_varchar') {
    console.log('✅ Already an array column, no migration needed');
  } else {
    // Drop ENUM type dependency and convert to text array
    await sequelize.query('ALTER TABLE jobs ALTER COLUMN "jobType" TYPE VARCHAR(255)[] USING ARRAY["jobType"::VARCHAR]');
    console.log('✅ jobType migrated to VARCHAR array');
  }
} catch (e) {
  console.error('❌ Migration error:', e.message);
} finally {
  await sequelize.close();
}
