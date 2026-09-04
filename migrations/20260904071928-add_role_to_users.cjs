'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;
    const tableDescription = await queryInterface.describeTable('users');

    if (!tableDescription.role) {
      await queryInterface.addColumn('users', 'role', {
        type: DataTypes.ENUM('candidate', 'employer', 'admin', 'super_admin', 'manager', 'recruiter'),
        defaultValue: 'candidate',
        allowNull: false,
        comment: 'User role: candidate, employer, admin, super_admin, manager, or recruiter'
      });
      console.log('Role column added to users table');
    } else {
      console.log('Role column already exists in users table');
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'role');
  }
};
