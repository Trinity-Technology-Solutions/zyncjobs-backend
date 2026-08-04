import { sequelize } from '../config/postgresql.js';

// Extends the PostgreSQL "jobType" enum column of the Jobs table with values
// added to the Job model AFTER the table was first created. Sequelize sync()
// does not alter existing enum columns, so publishing a job whose jobType
// is missing from the DB enum fails with
//   invalid input value for enum "enum_Jobs_jobType": "..."
export async function migrateJobTypeEnum() {
  const values = ['Freelance', 'Internship', 'Temporary'];

  // Resolve the real enum type name (Sequelize default: enum_Jobs_jobType)
  const [rows] = await sequelize.query(
    `SELECT t.typname FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     JOIN pg_attribute a ON a.atttypid = t.oid
     JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relname = 'Jobs' AND a.attname = 'jobType' AND t.typtype = 'e'
     LIMIT 1`
  );
  const typeName = rows[0]?.typname || 'enum_Jobs_jobType';

  for (const value of values) {
    try {
      await sequelize.query(`ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS '${value}'`);
    } catch (err) {
      // PostgreSQL < 12 lacks IF NOT EXISTS — retry plainly, ignore
      // "already exists" errors either way
      if (/already exists|duplicate_object/i.test(err.message || '')) continue;
      try {
        await sequelize.query(`ALTER TYPE "${typeName}" ADD VALUE '${value}'`);
      } catch (err2) {
        if (!/already exists|duplicate_object/i.test(err2.message || '')) throw err2;
      }
    }
  }
}
