'use strict';

// Date fragments (for example "489 (2026" or "2021 - 2025") are not
// candidate phone numbers and must not remain searchable/exportable as such.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE tracker_rows
      SET phone = ''
      WHERE COALESCE(phone, '') ~ '\\m(19|20)[0-9]{2}\\M'
    `);
  },
  async down() {
    throw new Error('No automatic rollback: date-like phone values were intentionally cleared.');
  },
};
