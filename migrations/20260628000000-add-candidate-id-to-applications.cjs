'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // applications table
    const appsDesc = await queryInterface.describeTable('applications');
    if (!appsDesc.candidate_id) {
      await queryInterface.addColumn('applications', 'candidate_id', {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }

    // talent_candidates table
    const talentDesc = await queryInterface.describeTable('talent_candidates');
    if (!talentDesc.candidate_id) {
      await queryInterface.addColumn('talent_candidates', 'candidate_id', {
        type: Sequelize.STRING(20),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('applications', 'candidate_id');
    await queryInterface.removeColumn('talent_candidates', 'candidate_id');
  },
};
