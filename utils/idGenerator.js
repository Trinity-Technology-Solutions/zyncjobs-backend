/**
 * ID Generation Service for Zyncjobs
 * Sequential numbering system starting from 0001
 */

import { sequelize } from '../config/postgresql.js';

/**
 * Get next sequential Employer ID
 * Format: 0001, 0002, 0003...
 */
export const generateEmployerId = async () => {
  try {
    // Get the highest existing employer ID
    const [results] = await sequelize.query(
      "SELECT MAX(CAST(employerId AS INTEGER)) as maxId FROM users WHERE employerId IS NOT NULL AND employerId ~ '^[0-9]+$'"
    );
    
    const maxId = results[0]?.maxId || 0;
    const nextId = maxId + 1;
    
    // Format as 4-digit padded number
    return nextId.toString().padStart(4, '0');
  } catch (error) {
    console.error('Error generating employer ID:', error);
    // Fallback to timestamp-based ID
    return Date.now().toString().slice(-4).padStart(4, '0');
  }
};

/**
 * Get next sequential Position ID for current year
 * Format: 0001, 0002, 0003... (resets each year)
 */
export const generatePositionId = async () => {
  try {
    const currentYear = new Date().getFullYear();
    console.log('Generating position ID for year:', currentYear);
    
    // Get the highest sequence number for current year using simpler query
    const [results] = await sequelize.query(
      `SELECT "positionId" FROM jobs WHERE "positionId" LIKE '${currentYear}-%' ORDER BY "positionId" DESC LIMIT 1`
    );
    
    let nextSequence = 1;
    
    if (results.length > 0) {
      const lastPositionId = results[0].positionId;
      console.log('Last position ID found:', lastPositionId);
      
      // Extract sequence number from format YYYY-NNNN
      const sequencePart = lastPositionId.split('-')[1];
      if (sequencePart) {
        nextSequence = parseInt(sequencePart) + 1;
      }
    }
    
    console.log('Next sequence number:', nextSequence);
    
    // Format as 4-digit padded number
    return nextSequence.toString().padStart(4, '0');
  } catch (error) {
    console.error('Error generating position ID:', error);
    // Fallback: start from 0001
    return '0001';
  }
};

/**
 * Generate Position ID with year prefix
 * Format: 2024-0001, 2024-0002...
 */
export const generatePositionIdWithYear = async () => {
  const year = new Date().getFullYear();
  const sequence = await generatePositionId();
  return `${year}-${sequence}`;
};

/**
 * Validate Employer ID format (4 digits)
 */
export const isValidEmployerId = (employerId) => {
  return /^\d{4}$/.test(employerId);
};

/**
 * Validate Position ID format (4 digits or YYYY-NNNN)
 */
export const isValidPositionId = (positionId) => {
  return /^\d{4}$/.test(positionId) || /^\d{4}-\d{4}$/.test(positionId);
};