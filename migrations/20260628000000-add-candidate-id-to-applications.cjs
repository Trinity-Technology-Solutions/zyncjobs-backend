'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('applications');
    if (!tableDesc.candidate_id) {
      await queryInterface.addColumn('applications', 'candidate_id', {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('applications', 'candidate_id');
  },
};
