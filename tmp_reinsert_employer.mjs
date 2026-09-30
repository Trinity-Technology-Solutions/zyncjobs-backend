import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || `postgresql://postgres:${process.env.DB_PASSWORD || 'postgres'}@localhost:5432/${process.env.DB_NAME || 'zyncjobs'}` });

const id = uuidv4();
const hash = await bcrypt.hash('Muthees@1412', 12);
const now = new Date().toISOString();

await pool.query(`
  INSERT INTO users (
    id, email, password, name, role, status, "isActive",
    "verificationStatus", "companyName", "employerId",
    "createdAt", "updatedAt"
  ) VALUES (
    $1::uuid, 'muthees@trinitetech.com', $2, 'Muthees', 'employer',
    'active', true, 'verified',
    'Trinity Technology Solutions',
    $1::text,
    $3, $3
  )
`, [id, hash, now]);

console.log('Inserted muthees@trinitetech.com as employer, id:', id);

// Verify
const r = await pool.query(`SELECT id, email, role, status, "isActive", "verificationStatus", "companyName" FROM users WHERE email = 'muthees@trinitetech.com'`);
console.log('Verified:', JSON.stringify(r.rows[0], null, 2));

await pool.end();
