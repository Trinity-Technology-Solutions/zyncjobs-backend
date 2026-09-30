'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (!table.extraRoles) {
      await queryInterface.addColumn('users', 'extraRoles', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: [],
        allowNull: true,
        comment: 'Additional roles e.g. employer who also has recruiter access'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'extraRoles');
  }
};
