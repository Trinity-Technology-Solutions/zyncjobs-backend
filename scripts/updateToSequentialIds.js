/**
 * Migration Script: Update existing jobs to use sequential IDs
 * This will reset all employer and position IDs to start from 0001
 */

import { sequelize } from '../config/postgresql.js';
import Job from '../models/Job.js';
import User from '../models/User.js';

const updateToSequentialIds = async () => {
  try {
    console.log('🔄 Starting migration to sequential IDs...');

    // Start transaction
    const transaction = await sequelize.transaction();

    try {
      // 1. Get all unique employers
      const employers = await User.findAll({
        where: { role: 'employer' },
        attributes: ['id', 'email', 'employerId'],
        transaction
      });

      console.log(`📊 Found ${employers.length} employers`);

      // 2. Update employer IDs sequentially
      let employerCounter = 1;
      const employerIdMap = new Map();

      for (const employer of employers) {
        const newEmployerId = employerCounter.toString().padStart(4, '0');
        employerIdMap.set(employer.employerId, newEmployerId);
        
        await employer.update({ employerId: newEmployerId }, { transaction });
        console.log(`✅ Updated employer ${employer.email}: ${employer.employerId} → ${newEmployerId}`);
        
        employerCounter++;
      }

      // 3. Get all jobs and update position IDs
      const jobs = await Job.findAll({
        order: [['createdAt', 'ASC']], // Oldest first
        transaction
      });

      console.log(`📊 Found ${jobs.length} jobs`);

      let positionCounter = 1;

      for (const job of jobs) {
        const newPositionId = positionCounter.toString().padStart(4, '0');
        const newEmployerId = employerIdMap.get(job.employerId) || '0001';

        await job.update({
          employerId: newEmployerId,
          positionId: newPositionId
        }, { transaction });

        console.log(`✅ Updated job "${job.jobTitle}": Position ${job.positionId} → ${newPositionId}, Employer ${job.employerId} → ${newEmployerId}`);
        
        positionCounter++;
      }

      // Commit transaction
      await transaction.commit();

      console.log('🎉 Migration completed successfully!');
      console.log(`📈 Updated ${employers.length} employers and ${jobs.length} jobs`);
      console.log('🔢 All IDs now start from 0001 and increment sequentially');

    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

// Run migration
updateToSequentialIds();