import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

const TRINITY_USERS = [
  {
    name: 'Antony',
    email: 'antony@trinitetech.com',
    password: 'zyncjobs@2026',
  },
  {
    name: 'Annie E',
    email: 'annie.e@trinitetech.com',
    password: 'zyncjobs@2026',
  },
];

const COMPANY_NAME = 'Trinity Technology Solutions';
const COMPANY_DOMAIN = 'trinitetech.com';

async function addTrinityUsers() {
  await client.connect();

  for (const user of TRINITY_USERS) {
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [user.email]);
    if (existing.rows.length > 0) {
      console.log(`⚠️  Already exists: ${user.email}`);
      continue;
    }

    const hash = await bcrypt.hash(user.password, 10);
    await client.query(
      `INSERT INTO users (
        id, email, password, name, role,
        "companyName", "company", "employerId",
        "isActive", "emailVerified", "verificationStatus",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, 'employer',
        $4, $4, $5,
        true, true, 'verified',
        NOW(), NOW()
      )`,
      [user.email, hash, user.name, COMPANY_NAME, `EMP-TRINITY-${Date.now()}`]
    );

    console.log(`✅ Created: ${user.name} (${user.email})`);
    console.log(`   Password: ${user.password}`);
    console.log(`   Company : ${COMPANY_NAME}`);
    console.log(`   Status  : verified`);
    console.log('');
  }

  await client.end();
  console.log('Done!');
}

addTrinityUsers().catch(err => { console.error(err); process.exit(1); });
