import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const seq = new Sequelize(process.env.DATABASE_URL, { dialect: 'postgres', logging: false });
await seq.authenticate();

const [all] = await seq.query(`SELECT COUNT(*) as total FROM jobs WHERE "isActive" = true AND status = 'approved'`);
console.log('Total approved active jobs:', all);

const [byEmployer] = await seq.query(`SELECT COUNT(*) as total FROM jobs WHERE "employerId" = 'EID0024' AND "isActive" = true`);
console.log('Jobs with EID0024:', byEmployer);

const [byCompany1] = await seq.query(`SELECT COUNT(*) as total FROM jobs WHERE "companyId" = '3ffd935f-798b-4599-a1e3-c1392223f0a6' AND "isActive" = true`);
console.log('Trinity companyId jobs:', byCompany1);

const [byCompany2] = await seq.query(`SELECT COUNT(*) as total FROM jobs WHERE "companyId" = '458291c8-71b0-413a-a2b3-3c9fce91da57' AND "isActive" = true`);
console.log('Nambikkai companyId jobs:', byCompany2);

const [sample] = await seq.query(`SELECT id, "jobTitle", company, "employerId", "companyId", status, "isActive" FROM jobs WHERE company ILIKE '%trinity%' OR company ILIKE '%nambikkai%' LIMIT 10`);
console.log('Sample rows:', JSON.stringify(sample, null, 2));

await seq.close();
