import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const r = await pool.query(`SELECT email, role, permissions, "extraRoles" FROM users WHERE email = 'muthees@trinitetech.com'`);
console.log('DB state:', JSON.stringify(r.rows[0], null, 2));
await pool.end();
