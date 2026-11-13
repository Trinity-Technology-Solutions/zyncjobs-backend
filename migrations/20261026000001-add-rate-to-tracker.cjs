'use strict';

// Free text supports values such as "$65/hr", "C2C $80/hr", and "120k/year".
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE IF EXISTS tracker_rows
        ADD COLUMN IF NOT EXISTS rate VARCHAR(100) NOT NULL DEFAULT ''
    `);
  },
  async down() {
    throw new Error('No automatic rollback: tracker rate values may contain user-entered data.');
  },
};
