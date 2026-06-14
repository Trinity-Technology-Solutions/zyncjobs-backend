import { sequelize } from '../config/postgresql.js';

const [results] = await sequelize.query(
  `SELECT id, name, logo, website, "companyWebsite", "createdBy" FROM companies ORDER BY "createdAt" DESC LIMIT 20`
);

const [userCompanies] = await sequelize.query(
  `SELECT DISTINCT company, email FROM users WHERE role='employer' AND company IS NOT NULL AND company != '' ORDER BY "createdAt" DESC LIMIT 20`
);

console.log('\n=== Companies Table ===');
results.forEach(c => {
  const logoStatus = !c.logo ? 'NULL' : c.logo === '' ? 'EMPTY' : c.logo.substring(0, 60);
  console.log(`${c.name} | logo: ${logoStatus}`);
});

console.log(`\n=== Employers in Users Table ===`);
userCompanies.forEach(u => {
  const inDB = results.find(c => c.name?.toLowerCase() === u.company?.toLowerCase());
  console.log(`${u.company} | email: ${u.email} | in companies DB: ${inDB ? 'YES' : 'NO ❌'}`);
});

await sequelize.close();
