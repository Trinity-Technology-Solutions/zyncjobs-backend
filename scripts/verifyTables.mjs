import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ host: 'localhost', port: 5432, database: 'zyncjobs', user: 'postgres', password: 'Muthees@1412' });

async function check() {
  const r1 = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('submission_batches', 'candidate_submissions')");
  console.log('tables:', r1.rows);
  
  const r2 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'submission_batches'");
  console.log('submission_batches columns:', r2.rows.map(c => c.column_name));
  
  const r3 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'candidate_submissions'");
  console.log('candidate_submissions columns:', r3.rows.map(c => c.column_name));
  
  await pool.end();
}

check();