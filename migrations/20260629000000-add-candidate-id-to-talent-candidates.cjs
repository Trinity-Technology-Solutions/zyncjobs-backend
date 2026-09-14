'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const talentDesc = await queryInterface.describeTable('talent_candidates');
    if (!talentDesc.candidate_id) {
      await queryInterface.addColumn('talent_candidates', 'candidate_id', {
        type: Sequelize.STRING(20),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('talent_candidates', 'candidate_id');
  },
};
