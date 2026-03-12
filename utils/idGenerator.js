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
 * Get next sequential Position ID
 * Format: 0001, 0002, 0003...
 */
export const generatePositionId = async () => {
  try {
    // Get the highest existing position ID
    const [results] = await sequelize.query(
      "SELECT MAX(CAST(positionId AS INTEGER)) as maxId FROM jobs WHERE positionId IS NOT NULL AND positionId ~ '^[0-9]+$'"
    );
    
    const maxId = results[0]?.maxId || 0;
    const nextId = maxId + 1;
    
    // Format as 4-digit padded number
    return nextId.toString().padStart(4, '0');
  } catch (error) {
    console.error('Error generating position ID:', error);
    // Fallback to timestamp-based ID
    return Date.now().toString().slice(-4).padStart(4, '0');
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