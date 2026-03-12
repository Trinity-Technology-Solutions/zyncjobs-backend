/**
 * Migration script to add Employer ID and Position ID to existing data
 * Run this after updating the models
 */

import { sequelize } from '../config/postgresql.js';
import User from '../models/User.js';
import Job from '../models/Job.js';
import { generateEmployerId, generatePositionId } from '../utils/idGenerator.js';

export const migrateToIdSystem = async () => {
  console.log('🚀 Starting migration to ID system...');
  
  try {
    // Step 1: Add employerId to existing employers
    const employers = await User.findAll({ 
      where: { 
        role: 'employer',
        employerId: null 
      } 
    });
    
    console.log(`📋 Found ${employers.length} employers without employer IDs`);
    
    for (const employer of employers) {
      const employerId = generateEmployerId();
      await employer.update({ employerId });
      console.log(`✅ Assigned Employer ID ${employerId} to ${employer.email}`);
    }
    
    // Step 2: Add employerId and positionId to existing jobs
    const jobs = await Job.findAll({ 
      where: { 
        employerId: null 
      } 
    });
    
    console.log(`📋 Found ${jobs.length} jobs without IDs`);
    
    for (const job of jobs) {
      // Find employer by email
      const employer = await User.findOne({ 
        where: { 
          email: job.employerEmail,
          role: 'employer' 
        } 
      });
      
      let employerId;
      if (employer && employer.employerId) {
        employerId = employer.employerId;
      } else {
        // Generate new employer ID if not found
        employerId = generateEmployerId();
        if (employer) {
          await employer.update({ employerId });
        }
      }
      
      const positionId = generatePositionId();
      
      await job.update({ 
        employerId,
        positionId 
      });
      
      console.log(`✅ Job "${job.jobTitle}" - Employer ID: ${employerId}, Position ID: ${positionId}`);
    }
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateToIdSystem()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}