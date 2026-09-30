import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Add recruiter_portal_access permission so muthees can login to admin panel
await pool.query(`
  UPDATE users SET
    permissions = ARRAY['recruiter_portal_access'],
    "extraRoles" = ARRAY['recruiter']
  WHERE email = 'muthees@trinitetech.com'
`);

const r = await pool.query(`SELECT email, role, permissions, "extraRoles" FROM users WHERE email = 'muthees@trinitetech.com'`);
console.log('Updated:', JSON.stringify(r.rows[0], null, 2));
await pool.end();
