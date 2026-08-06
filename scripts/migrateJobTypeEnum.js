import { sequelize } from '../config/postgresql.js';

// Extends the PostgreSQL "jobType" enum column of the Jobs table with values
// added to the Job model AFTER the table was first created. Sequelize sync()
// does not alter existing enum columns, so publishing a job whose jobType
// is missing from the DB enum fails with
//   invalid input value for enum "enum_Jobs_jobType": "..."
export async function migrateJobTypeEnum() {
  const enumTypeName = 'enum_Jobs_jobType';
  const additionalValues = ['Freelance', 'Internship', 'Temporary'];

  // Check if enum type already exists
  const [existingTypes] = await sequelize.query(
    `SELECT typname FROM pg_type WHERE typname = '${enumTypeName}'`
  );

  if (!existingTypes || existingTypes.length === 0) {
    // Create the enum type with all base values
    await sequelize.query(
      `CREATE TYPE ${enumTypeName} AS ENUM ('Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary')`
    );
    console.log(`✅ Created enum type: ${enumTypeName}`);
  } else {
    console.log(`ℹ️ Enum type already exists: ${enumTypeName}`);
  }

  // Add additional values if they don't already exist
  for (const value of additionalValues) {
    try {
      await sequelize.query(
        `ALTER TYPE "${enumTypeName}" ADD VALUE IF NOT EXISTS '${value}'`
      );
    } catch (err) {
      if (/already exists|duplicate_object/i.test(err.message || '')) {
        console.log(`ℹ️ Value '${value}' already exists in enum ${enumTypeName}`);
        continue;
      }
      console.error(`❌ Error adding value '${value}':`, err.message);
      throw err;
    }
  }

  console.log(`✅ Successfully migrated ${enumTypeName} enum`);
}
