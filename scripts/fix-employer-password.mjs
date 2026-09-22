/**
 * Fix employer password + unlock account
 * Usage: node scripts/fix-employer-password.mjs
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Client } = pg;

const EMAIL = 'muthees@trinitetech.com';
const NEW_PASSWORD = 'Muthees@1412';

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

  // 1. Check current user state
  const check = await client.query(
    `SELECT id, email, name, role, "verificationStatus", "isActive", status,
            "failedLoginAttempts", "accountLockedUntil", "companyName"
     FROM users WHERE email ILIKE $1`,
    [EMAIL]
  );

  if (check.rows.length === 0) {
    console.error('❌ User not found:', EMAIL);
    await client.end();
    process.exit(1);
  }

  const user = check.rows[0];
  console.log('\n📋 Current user state:');
  console.log('  ID:', user.id);
  console.log('  Email:', user.email);
  console.log('  Name:', user.name);
  console.log('  Role:', user.role);
  console.log('  Company:', user.companyName);
  console.log('  verificationStatus:', user.verificationStatus);
  console.log('  isActive:', user.isActive);
  console.log('  status:', user.status);
  console.log('  failedLoginAttempts:', user.failedLoginAttempts);
  console.log('  accountLockedUntil:', user.accountLockedUntil);

  // 2. Hash new password
  const hash = await bcrypt.hash(NEW_PASSWORD, 10);
  console.log('\n🔐 New password hash generated');

  // 3. Update: reset password + unlock + verify + activate
  await client.query(
    `UPDATE users SET
       password = $1,
       "failedLoginAttempts" = 0,
       "accountLockedUntil" = NULL,
       "lastFailedLogin" = NULL,
       "isActive" = true,
       status = 'active',
       "verificationStatus" = 'verified',
       "mustChangePassword" = false,
       "lastPasswordChange" = NOW()
     WHERE email ILIKE $2`,
    [hash, EMAIL]
  );

  console.log('\n✅ Updated successfully:');
  console.log('  - Password reset to: Muthees@1412');
  console.log('  - Account unlocked (failedLoginAttempts = 0)');
  console.log('  - verificationStatus = verified');
  console.log('  - isActive = true, status = active');

  // 4. Verify the fix
  const verify = await client.query(
    `SELECT email, role, "verificationStatus", "isActive", status,
            "failedLoginAttempts", "accountLockedUntil"
     FROM users WHERE email ILIKE $1`,
    [EMAIL]
  );
  console.log('\n📋 After fix:');
  console.table(verify.rows);

  // 5. Quick bcrypt verify
  const testMatch = await bcrypt.compare(NEW_PASSWORD, hash);
  console.log('\n🔐 Password verify test:', testMatch ? '✅ PASS' : '❌ FAIL');

  await client.end();
  console.log('\n🎉 Done! Try logging in now with Muthees@1412');
}

fix().catch(err => {
  console.error('❌ Script error:', err.message);
  process.exit(1);
});
