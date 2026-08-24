import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'zyncjobs',
  user: 'postgres',
  password: 'Muthees@1412'
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add candidate_id to talent_candidates (ZC-XXXXXX format)
    console.log('Adding candidate_id column...');
    await client.query(`
      ALTER TABLE talent_candidates 
      ADD COLUMN IF NOT EXISTS candidate_id VARCHAR(20);
    `);
    
    // Generate candidate_id for existing records
    await client.query(`
      UPDATE talent_candidates tc
      SET candidate_id = sub.cid
      FROM (
        SELECT id, 'ZC-' || LPAD(ROW_NUMBER() OVER (ORDER BY "addedDate")::TEXT, 6, '0') as cid
        FROM talent_candidates
        WHERE candidate_id IS NULL
      ) sub
      WHERE tc.id = sub.id;
    `);
    
    // Make it unique and not null
    await client.query(`
      ALTER TABLE talent_candidates 
      ALTER COLUMN candidate_id SET NOT NULL;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_talent_candidates_candidate_id 
      ON talent_candidates (candidate_id);
    `);

    // 2. Create submission_batches table
    console.log('Creating submission_batches table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS submission_batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id VARCHAR(30) UNIQUE NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        job_title VARCHAR(255),
        submitted_by UUID REFERENCES users(id),
        submitted_at TIMESTAMP DEFAULT NOW(),
        candidate_count INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Submitted',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_submission_batches_batch_id ON submission_batches(batch_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_submission_batches_client ON submission_batches(client_name);`);

    // 3. Create candidate_submissions table
    console.log('Creating candidate_submissions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id UUID REFERENCES submission_batches(id) ON DELETE CASCADE,
        candidate_id VARCHAR(20) REFERENCES talent_candidates(candidate_id) ON DELETE CASCADE,
        candidate_name VARCHAR(255),
        candidate_email VARCHAR(255),
        status VARCHAR(50) DEFAULT 'submitted',
        submitted_at TIMESTAMP DEFAULT NOW(),
        shortlisted_at TIMESTAMP,
        rejected_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(batch_id, candidate_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_candidate_submissions_batch ON candidate_submissions(batch_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_candidate_submissions_candidate ON candidate_submissions(candidate_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_candidate_submissions_status ON candidate_submissions(status);`);

    // 4. Create trigger function to generate batch_id
    await client.query(`
      CREATE OR REPLACE FUNCTION generate_batch_id()
      RETURNS TRIGGER AS $$
      DECLARE
        new_id VARCHAR(30);
        year INTEGER := EXTRACT(YEAR FROM NOW());
        seq INTEGER;
      BEGIN
        SELECT COALESCE(MAX(CAST(SUBSTRING(batch_id FROM 'SUB-\d{4}-(\d+)') AS INTEGER)), 0) + 1
        INTO seq
        FROM submission_batches
        WHERE batch_id LIKE 'SUB-' || year || '-%';
        new_id := 'SUB-' || year || '-' || LPAD(seq::TEXT, 5, '0');
        NEW.batch_id := new_id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 5. Create trigger to auto-generate batch_id on insert
    await client.query(`
      DROP TRIGGER IF EXISTS set_batch_id ON submission_batches;
      CREATE TRIGGER set_batch_id
      BEFORE INSERT ON submission_batches
      FOR EACH ROW
      EXECUTE FUNCTION generate_batch_id();
    `);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run();