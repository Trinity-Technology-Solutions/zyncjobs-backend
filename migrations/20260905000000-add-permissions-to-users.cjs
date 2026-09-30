'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'permissions', {
      type: Sequelize.ARRAY(Sequelize.STRING),
      defaultValue: [],
      allowNull: true,
      comment: 'Explicit permission grants e.g. recruiter_portal_access'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'permissions');
  }
};
