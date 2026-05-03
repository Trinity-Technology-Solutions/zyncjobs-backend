import { sequelize } from '../config/postgresql.js';
import Job from '../models/Job.js';

async function migrateJobRefreshFields() {
  try {
    console.log('🔄 Starting job refresh fields migration...');
    const queryInterface = sequelize.getQueryInterface();

    const columns = [
      { name: 'refreshCount', type: 'INTEGER', defaultValue: 0, allowNull: false },
      { name: 'lastRefreshedAt', type: 'TIMESTAMP WITH TIME ZONE', allowNull: true },
      { name: 'originalPostedAt', type: 'TIMESTAMP WITH TIME ZONE', allowNull: true }
    ];

    for (const col of columns) {
      try {
        await queryInterface.addColumn('jobs', col.name, col);
        console.log(`✅ Added ${col.name} column`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`ℹ️ ${col.name} column already exists`);
        } else {
          throw error;
        }
      }
    }

    // Backfill originalPostedAt for existing jobs
    await sequelize.query(`
      UPDATE jobs SET "originalPostedAt" = "createdAt", "refreshCount" = 0
      WHERE "originalPostedAt" IS NULL
    `);
    console.log('✅ Backfilled existing jobs with originalPostedAt');

    for (const indexCol of ['refreshCount', 'lastRefreshedAt']) {
      try {
        await queryInterface.addIndex('jobs', [indexCol]);
        console.log(`✅ Added index for ${indexCol}`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`ℹ️ ${indexCol} index already exists`);
        } else {
          console.log(`⚠️ Could not add ${indexCol} index:`, error.message);
        }
      }
    }

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

migrateJobRefreshFields()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

export default migrateJobRefreshFields;
