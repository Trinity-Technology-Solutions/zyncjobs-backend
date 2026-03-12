/**
 * Simple script to update current job to sequential IDs
 */

import { sequelize } from '../config/postgresql.js';

const updateCurrentJob = async () => {
  try {
    console.log('🔄 Updating current job to sequential IDs...');

    // Update the specific job with old IDs to new sequential IDs
    const [results] = await sequelize.query(`
      UPDATE jobs 
      SET 
        "employerId" = '0001',
        "positionId" = '0001'
      WHERE 
        "employerId" = '29574296' 
        AND "positionId" = '2026-1769'
      RETURNING "jobTitle", "employerId", "positionId";
    `);

    if (results.length > 0) {
      console.log('✅ Successfully updated job:');
      console.log(`   Job: ${results[0].jobTitle}`);
      console.log(`   Employer ID: 29574296 → ${results[0].employerId}`);
      console.log(`   Position ID: 2026-1769 → ${results[0].positionId}`);
    } else {
      console.log('❌ No job found with those IDs');
    }

    // Also update the employer in users table
    await sequelize.query(`
      UPDATE users 
      SET "employerId" = '0001'
      WHERE "email" = 'muthees@trinitetech.com'
      AND "role" = 'employer';
    `);

    console.log('✅ Updated employer ID in users table');
    console.log('🎉 Migration completed! Refresh your job details page to see the new IDs.');

  } catch (error) {
    console.error('❌ Update failed:', error);
  } finally {
    await sequelize.close();
  }
};

updateCurrentJob();