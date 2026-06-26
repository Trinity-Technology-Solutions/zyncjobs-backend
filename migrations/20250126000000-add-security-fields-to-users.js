export async function up(queryInterface, Sequelize) {
  const { DataTypes } = Sequelize;
  
  // Check if columns already exist before adding
  const tableDescription = await queryInterface.describeTable('users');
  
  const columnsToAdd = [];
  
  if (!tableDescription.lastPasswordChange) {
    columnsToAdd.push({
      name: 'lastPasswordChange',
      config: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  }
  
  if (!tableDescription.passwordExpiryDays) {
    columnsToAdd.push({
      name: 'passwordExpiryDays',
      config: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '0 = no expiry; 90 for admins'
      }
    });
  }
  
  if (!tableDescription.mustChangePassword) {
    columnsToAdd.push({
      name: 'mustChangePassword',
      config: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    });
  }
  
  if (!tableDescription.passwordHistory) {
    columnsToAdd.push({
      name: 'passwordHistory',
      config: {
        type: DataTypes.JSONB,
        defaultValue: [],
        comment: 'Array of {hash, changedAt} — last 5 passwords'
      }
    });
  }
  
  if (!tableDescription.failedLoginAttempts) {
    columnsToAdd.push({
      name: 'failedLoginAttempts',
      config: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      }
    });
  }
  
  if (!tableDescription.accountLockedUntil) {
    columnsToAdd.push({
      name: 'accountLockedUntil',
      config: {
        type: DataTypes.DATE,
        allowNull: true
      }
    });
  }
  
  if (!tableDescription.lastFailedLogin) {
    columnsToAdd.push({
      name: 'lastFailedLogin',
      config: {
        type: DataTypes.DATE,
        allowNull: true
      }
    });
  }
  
  if (!tableDescription.lastSuccessfulLogin) {
    columnsToAdd.push({
      name: 'lastSuccessfulLogin',
      config: {
        type: DataTypes.DATE,
        allowNull: true
      }
    });
  }
  
  // Add all columns
  for (const col of columnsToAdd) {
    await queryInterface.addColumn('users', col.name, col.config);
    console.log(`✅ Added column: ${col.name}`);
  }
  
  // Update existing admin users to have 90-day password expiry
  await queryInterface.sequelize.query(`
    UPDATE users 
    SET 
      "passwordExpiryDays" = 90,
      "lastPasswordChange" = COALESCE("lastPasswordChange", "createdAt", NOW())
    WHERE role IN ('admin', 'super_admin')
  `);
  
  console.log('✅ Updated admin users with 90-day password expiry');
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn('users', 'lastPasswordChange');
  await queryInterface.removeColumn('users', 'passwordExpiryDays');
  await queryInterface.removeColumn('users', 'mustChangePassword');
  await queryInterface.removeColumn('users', 'passwordHistory');
  await queryInterface.removeColumn('users', 'failedLoginAttempts');
  await queryInterface.removeColumn('users', 'accountLockedUntil');
  await queryInterface.removeColumn('users', 'lastFailedLogin');
  await queryInterface.removeColumn('users', 'lastSuccessfulLogin');
}
