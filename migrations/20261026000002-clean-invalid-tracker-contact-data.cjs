'use strict';

// Remove only values that are objectively stored in the wrong tracker column.
// Valid values are preserved; this is intentionally a data-quality migration.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(`
        UPDATE tracker_rows
        SET phone = ''
        WHERE COALESCE(phone, '') ~ '^[[:space:]]*[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4}[[:space:]]*$'
      `, { transaction });
      await queryInterface.sequelize.query(`
        UPDATE tracker_rows
        SET email = ''
        WHERE COALESCE(email, '') <> ''
          AND email !~* '^[^[:space:]@]+@([a-z0-9-]+\\.)+[a-z]{2,63}$'
      `, { transaction });
      await queryInterface.sequelize.query(`
        UPDATE tracker_rows
        SET location = ''
        WHERE COALESCE(location, '') ~* '\\m(contact|phone|mobile|telephone|email|e-mail|dob|date[[:space:]]+of[[:space:]]+birth)\\M'
          OR COALESCE(location, '') ~ '\\+?[0-9]([[:space:]().-]*[0-9]){6,}'
      `, { transaction });
    });
  },
  async down() {
    throw new Error('No automatic rollback: invalid contact data was intentionally cleared.');
  },
};
