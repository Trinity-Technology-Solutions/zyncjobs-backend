'use strict';

// Additive migration: existing submissions and their values are preserved.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(`
        ALTER TABLE IF EXISTS tracker_rows
          ADD COLUMN IF NOT EXISTS location VARCHAR(255) NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(1024) NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS qualification VARCHAR(255) NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS tax_term VARCHAR(255) NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS visa_status VARCHAR(255) NOT NULL DEFAULT ''
      `, { transaction });
    });
  },
  async down() {
    throw new Error('No automatic rollback: tracker recruitment details may contain user-entered data.');
  },
};
