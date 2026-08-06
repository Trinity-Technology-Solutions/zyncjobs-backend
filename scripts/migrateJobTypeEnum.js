import { sequelize } from '../config/postgresql.js';

// Extends the PostgreSQL "jobType" enum column of the Jobs table with values
// added to the Job model AFTER the table was first created. Sequelize sync()
// does not alter existing enum columns, so publishing a job whose jobType
// is missing from the DB enum fails with
//   invalid input value for enum "enum_Jobs_jobType": "..."
export async function migrateJobTypeEnum() {
  const enumTypeName = 'enum_Jobs_jobType';
  const additionalValues = ['Freelance', 'Internship', 'Temporary'];

  // Check if enum type already exists (Postgres stores type names lowercase)
  const [existingTypes] = await sequelize.query(
    `SELECT typname FROM pg_type WHERE typtype = 'e' AND LOWER(typname) = '${enumTypeName.toLowerCase()}'`
  );

  const actualTypeName = existingTypes && existingTypes.length > 0 ? existingTypes[0].typname : null;

  if (!actualTypeName) {
    // Create the enum type with all base values
    // Concurrent server start may create it first, so ignore duplicates
    try {
      await sequelize.query(
        `CREATE TYPE ${enumTypeName} AS ENUM ('Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary')`
      );
      console.log(`✅ Created enum type: ${enumTypeName}`);
    } catch (err) {
      if (/already exists|duplicate_object|23505/i.test(err.message || '')) {
        console.log(`ℹ️ Enum type already exists (created by another process): ${enumTypeName}`);
      } else {
        throw err;
      }
    }
  } else {
    console.log(`ℹ️ Enum type already exists: ${actualTypeName}`);
  }

  // Add additional values if they don't already exist
  // (multiple enum types may exist with case variants; process all of them)
  const [enumRows] = await sequelize.query(
    `SELECT t.typname, t.oid
     FROM pg_type t
     WHERE t.typtype = 'e' AND LOWER(t.typname) = '${enumTypeName.toLowerCase()}'
     ORDER BY t.typname`
  );

  if (enumRows.length === 0) {
    console.log(`⚠️ No enum type found for ${enumTypeName}, values not added`);
    return;
  }

  for (const enumRow of enumRows) {
    const [existingValues] = await sequelize.query(
      `SELECT enumlabel FROM pg_enum WHERE enumtypid = ${enumRow.oid}`
    );
    const valuesSet = new Set(existingValues.map(v => v.enumlabel));
    const missingValues = additionalValues.filter(value => !valuesSet.has(value));

    if (missingValues.length === 0) {
      console.log(`✅ Enum ${enumRow.typname} already has all values`);
      continue;
    }

    for (const value of missingValues) {
      try {
        await sequelize.query(
          `ALTER TYPE "${enumRow.typname}" ADD VALUE IF NOT EXISTS '${value}'`
        );
        console.log(`✅ Added value '${value}' to enum ${enumRow.typname}`);
      } catch (err) {
        if (/already exists|duplicate_object/i.test(err.message || '')) {
          console.log(`ℹ️ Value '${value}' already exists in enum ${enumRow.typname}`);
          continue;
        }
        console.error(`❌ Error adding value '${value}':`, err.message);
        throw err;
      }
    }
  }

  console.log(`✅ Successfully migrated ${enumTypeName} enum`);
}
