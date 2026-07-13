export async function up(queryInterface, Sequelize) {
  const tableDesc = await queryInterface.describeTable('applications');

  if (!tableDesc.skills) {
    await queryInterface.addColumn('applications', 'skills', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: true
    });
  }

  if (!tableDesc.resumeSkills) {
    await queryInterface.addColumn('applications', 'resumeSkills', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: true
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn('applications', 'skills');
  await queryInterface.removeColumn('applications', 'resumeSkills');
}
