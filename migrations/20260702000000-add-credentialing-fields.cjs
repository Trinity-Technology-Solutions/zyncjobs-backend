'use strict';

/**
 * Adds checklistItems, taxRate, currency to the credentialing table.
 * Safe to run multiple times (IF NOT EXISTS / try-catch per column).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    let desc;
    try {
      desc = await queryInterface.describeTable('credentialing');
    } catch {
      console.log('[credentialing migration] Table "credentialing" not found — skipping');
      return;
    }

    const columns = {
      checklistItems: { type: Sequelize.JSONB,   allowNull: true },
      taxRate:        { type: Sequelize.FLOAT,   allowNull: true, defaultValue: 0 },
      currency:       { type: Sequelize.STRING(10), allowNull: true, defaultValue: 'INR' },
    };

    for (const [col, definition] of Object.entries(columns)) {
      if (!desc[col]) {
        console.log(`[credentialing migration] Adding column: ${col}`);
        await queryInterface.addColumn('credentialing', col, definition);
      } else {
        console.log(`[credentialing migration] Column already exists: ${col} — skipping`);
      }
    }
  },

  async down(queryInterface) {
    for (const col of ['checklistItems', 'taxRate', 'currency']) {
      await queryInterface.removeColumn('credentialing', col);
    }
  },
};
