import { sequelize } from '../config/postgresql.js';

const [results] = await sequelize.query(
  `SELECT id, name, logo, website, "companyWebsite", "createdBy" FROM companies ORDER BY "createdAt" DESC LIMIT 20`
);

console.log('\n=== Company Logo Status ===');
results.forEach(c => {
  const logoStatus = !c.logo ? 'NULL' : c.logo === '' ? 'EMPTY' : c.logo.substring(0, 50);
  console.log(`${c.name} | logo: ${logoStatus} | website: ${c.website || c.companyWebsite || 'NONE'} | createdBy: ${c.createdBy || 'NONE'}`);
});

console.log(`\nTotal: ${results.length} companies`);
console.log(`Missing logo: ${results.filter(c => !c.logo || c.logo === '').length}`);

await sequelize.close();
