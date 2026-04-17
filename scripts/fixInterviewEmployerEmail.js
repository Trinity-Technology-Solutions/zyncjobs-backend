import { sequelize } from '../config/postgresql.js';

// Fix existing interviews that have employerId (UUID) but no employerEmail
const fix = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB');

    const [interviews] = await sequelize.query(
      `SELECT i.id, i."employerId", u.email 
       FROM interviews i
       JOIN users u ON u.id = i."employerId"
       WHERE i."employerEmail" IS NULL AND i."employerId" IS NOT NULL`
    );

    console.log(`Found ${interviews.length} interviews to fix`);

    for (const row of interviews) {
      await sequelize.query(
        `UPDATE interviews SET "employerEmail" = :email WHERE id = :id`,
        { replacements: { email: row.email, id: row.id } }
      );
      console.log(`Fixed interview ${row.id} -> ${row.email}`);
    }

    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
};

fix();
