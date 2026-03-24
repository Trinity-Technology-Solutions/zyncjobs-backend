import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });

const ADMIN_EMAIL    = 'admin@zyncjobs.com';
const ADMIN_PASSWORD = 'Admin@1234';
const ADMIN_NAME     = 'Super Admin';

async function createAdmin() {
  await client.connect();

  const existing = await client.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
  if (existing.rows.length > 0) {
    console.log('Admin already exists:', ADMIN_EMAIL);
    await client.end();
    return;
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await client.query(
    `INSERT INTO users (id, email, password, name, role, "isActive", "emailVerified", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, 'admin', true, true, NOW(), NOW())`,
    [ADMIN_EMAIL, hash, ADMIN_NAME]
  );

  console.log('✅ Admin created!');
  console.log('   Email   :', ADMIN_EMAIL);
  console.log('   Password:', ADMIN_PASSWORD);
  await client.end();
}

createAdmin().catch(err => { console.error(err); process.exit(1); });
