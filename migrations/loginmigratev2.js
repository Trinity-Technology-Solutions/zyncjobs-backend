export async function up(queryInterface, Sequelize) {
  const { DataTypes } = Sequelize;

  const tableDescription = await queryInterface.describeTable('users');

  if (!tableDescription.plan) {
    await queryInterface.addColumn('users', 'plan', {
      type: DataTypes.STRING,
      defaultValue: 'free',
      allowNull: false
    });
    console.log('✅ Added column: plan');
  }
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn('users', 'plan');
}
