/**
 * Change muthees@trinitetech.com from super_admin → employer
 * Usage: node scripts/fix-role-to-employer.mjs
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Client } = pg;

const EMAIL = 'muthees@trinitetech.com';
const PASSWORD = 'Muthees@1412';

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'zyncjobs',
  user: 'postgres',
  password: 'Muthees@1412',
});

async function fix() {
  await client.connect();
  console.log('✅ Connected to DB');

  // 1. Check current state
  const { rows } = await client.query(
    `SELECT id, email, name, role, "verificationStatus", "isActive", status,
            "companyName", "failedLoginAttempts", "accountLockedUntil"
     FROM users WHERE email ILIKE $1`,
    [EMAIL]
  );

  if (rows.length === 0) {
    console.error('❌ User not found:', EMAIL);
    await client.end();
    process.exit(1);
  }

  const user = rows[0];
  console.log('\n📋 Before:');
  console.log('  Role:', user.role);
  console.log('  verificationStatus:', user.verificationStatus);
  console.log('  failedLoginAttempts:', user.failedLoginAttempts);
  console.log('  accountLockedUntil:', user.accountLockedUntil);

  // 2. Hash fresh password
  const hash = await bcrypt.hash(PASSWORD, 10);

  // 3. Update role to employer + reset password + unlock
  await client.query(
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
       "lastPasswordChange" = NOW(),
       "passwordHistory" = '[]'::jsonb
     WHERE email ILIKE $2`,
    [hash, EMAIL]
  );

  // 4. Verify
  const after = await client.query(
    `SELECT email, role, "verificationStatus", "isActive", status,
            "failedLoginAttempts", "accountLockedUntil", "companyName"
     FROM users WHERE email ILIKE $1`,
    [EMAIL]
  );

  console.log('\n📋 After fix:');
  console.table(after.rows);

  // 5. Test password
  const ok = await bcrypt.compare(PASSWORD, hash);
  console.log('\n🔐 Password verify:', ok ? '✅ PASS' : '❌ FAIL');

  await client.end();
  console.log('\n🎉 Done!');
  console.log('   Email   :', EMAIL);
  console.log('   Password:', PASSWORD);
  console.log('   Role    : employer ✅');
}

fix().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
