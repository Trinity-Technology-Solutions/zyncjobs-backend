import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const hash = await bcrypt.hash('Muthees@1412', 12);

await pool.query(`
  UPDATE users SET
    role = 'employer',
    status = 'active',
    "isActive" = true,
    "verificationStatus" = 'verified',
    "companyName" = 'Trinity Technology Solutions',
    password = $1,
    "failedLoginAttempts" = 0,
    "accountLockedUntil" = NULL,
    "mustChangePassword" = false
  WHERE email = 'muthees@trinitetech.com'
`, [hash]);

const r = await pool.query(`SELECT id, email, role, status, "isActive", "verificationStatus" FROM users WHERE email = 'muthees@trinitetech.com'`);
console.log('Fixed:', JSON.stringify(r.rows[0], null, 2));
await pool.end();
