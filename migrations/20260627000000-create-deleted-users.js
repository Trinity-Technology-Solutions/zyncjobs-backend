'use strict';

export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('deleted_users', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    originalUserId: {
      type: Sequelize.UUID,
      allowNull: false
    },
    email: {
      type: Sequelize.STRING,
      allowNull: false
    },
    name: Sequelize.STRING,
    role: Sequelize.STRING,
    phone: Sequelize.STRING,
    location: Sequelize.STRING,
    deletionReason: Sequelize.TEXT,
    deletedAt: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    },
    userSnapshot:    { type: Sequelize.JSONB, allowNull: true },
    profileSnapshot: { type: Sequelize.JSONB, allowNull: true },
    resumeSnapshot:  { type: Sequelize.JSONB, allowNull: true },
    applicationCount: { type: Sequelize.INTEGER, defaultValue: 0 },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false }
  });

  await queryInterface.addIndex('deleted_users', ['email']);
  await queryInterface.addIndex('deleted_users', ['originalUserId']);
  await queryInterface.addIndex('deleted_users', ['deletedAt']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('deleted_users');
}
