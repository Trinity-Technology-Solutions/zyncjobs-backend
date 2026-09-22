import bcrypt from 'bcryptjs';
import pg from 'pg';

const client = new pg.Client({
  host: 'localhost', port: 5432,
  database: 'zyncjobs', user: 'postgres', password: 'Muthees@1412'
});
await client.connect();
console.log('Connected');

const PASSWORD = 'Muthees@1412';
const EMAIL = 'muthees@trinitetech.com';

// Generate fresh hash
const hash = await bcrypt.hash(PASSWORD, 10);
console.log('New hash:', hash);

// Verify hash is correct before saving
const verify = await bcrypt.compare(PASSWORD, hash);
console.log('Pre-save verify:', verify);
if (!verify) { console.error('Hash broken!'); process.exit(1); }

// Force update everything in one query
const result = await client.query(
  `UPDATE users SET
     role = 'employer',
     password = $1,
     "failedLoginAttempts" = 0,
     "accountLockedUntil" = NULL,
     "lastFailedLogin" = NULL,
     "isActive" = true,
     status = 'active',
     "verificationStatus" = 'verified',
     "mustChangePassword" = false,
     "passwordHistory" = '[]'::jsonb,
     "lastPasswordChange" = NOW()
   WHERE email ILIKE $2
   RETURNING id, email, role, "verificationStatus", "failedLoginAttempts", "accountLockedUntil"`,
  [hash, EMAIL]
);

console.log('\nUpdated row:');
console.table(result.rows);

// Final check — read back and test
const { rows } = await client.query(
  `SELECT password FROM users WHERE email ILIKE $1`, [EMAIL]
);
const finalMatch = await bcrypt.compare(PASSWORD, rows[0].password);
console.log('\nFinal password match from DB:', finalMatch ? '✅ PASS' : '❌ FAIL');

await client.end();
console.log('\nDone. Login with:', EMAIL, '/', PASSWORD);
