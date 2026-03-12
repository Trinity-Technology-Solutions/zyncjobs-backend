/**
 * Update current job to use year + number format for position ID
 */

import { sequelize } from '../config/postgresql.js';

const updateToYearFormat = async () => {
  try {
    console.log('🔄 Updating position ID to year format...');

    const currentYear = new Date().getFullYear();
    
    // Update the current job to use year format
    const [results] = await sequelize.query(`
      UPDATE jobs 
      SET "positionId" = '${currentYear}-0001'
      WHERE "employerId" = '0001' AND "positionId" = '0001'
      RETURNING "jobTitle", "employerId", "positionId";
    `);

    if (results.length > 0) {
      console.log('✅ Successfully updated position ID:');
      console.log(`   Job: ${results[0].jobTitle}`);
      console.log(`   Employer ID: ${results[0].employerId}`);
      console.log(`   Position ID: 0001 → ${results[0].positionId}`);
    } else {
      console.log('❌ No job found to update');
    }

    console.log('🎉 Update completed! Refresh your job details page.');

  } catch (error) {
    console.error('❌ Update failed:', error);
  } finally {
    await sequelize.close();
  }
};

updateToYearFormat();