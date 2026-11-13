'use strict';

// ISBNs are publication identifiers, not candidate contacts.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE tracker_rows
      SET phone = ''
      WHERE COALESCE(phone, '') ~ '^97[89][- ]?[0-9][- ]?[0-9]{3,5}[- ]?[0-9]{4,7}[- ]?[0-9]$'
    `);
  },
  async down() {
    throw new Error('No automatic rollback: ISBN-like phone values were intentionally cleared.');
  },
};
