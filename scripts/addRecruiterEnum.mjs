import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ host: 'localhost', port: 5432, database: 'zyncjobs', user: 'postgres', password: 'Muthees@1412' });

async function run() {
  try {
    await pool.query("ALTER TYPE public.enum_users_role ADD VALUE IF NOT EXISTS 'recruiter';");
    console.log('✅ ENUM updated - recruiter added');
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await pool.end();
  }
}

run();