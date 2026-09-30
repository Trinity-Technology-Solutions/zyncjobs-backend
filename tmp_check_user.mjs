import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || `postgresql://postgres:${process.env.DB_PASSWORD || 'postgres'}@localhost:5432/${process.env.DB_NAME || 'zyncjobs'}` });

const r = await pool.query(`SELECT id, email, role, status, "isActive", "verificationStatus", "companyName" FROM users WHERE email = 'muthees@trinitetech.com'`);
console.log('User rows:', JSON.stringify(r.rows, null, 2));
console.log('Count:', r.rows.length);
await pool.end();
