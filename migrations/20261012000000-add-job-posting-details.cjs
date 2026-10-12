'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.some(table => String(table).toLowerCase() === 'jobs')) return;

    const columns = await queryInterface.describeTable('jobs');
    if (!columns.postingDetails) {
      await queryInterface.addColumn('jobs', 'postingDetails', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('jobs').catch(() => ({}));
    if (columns.postingDetails) await queryInterface.removeColumn('jobs', 'postingDetails');
  }
};
