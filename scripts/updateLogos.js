import { sequelize } from '../config/postgresql.js';

const [companies] = await sequelize.query(
  `SELECT id, name, logo, website, "companyWebsite", "createdBy" FROM companies`
);

console.log(`Found ${companies.length} companies\n`);

let updated = 0;
for (const company of companies) {
  let domain = null;

  if (company.website && company.website !== 'NONE') {
    try {
      const url = company.website.startsWith('http') ? company.website : `https://${company.website}`;
      domain = new URL(url).hostname.replace('www.', '');
    } catch {}
  }

  if (!domain && company.companyWebsite) {
    try {
      domain = new URL(company.companyWebsite).hostname.replace('www.', '');
    } catch {}
  }

  if (!domain && company.createdBy && company.createdBy.includes('@')) {
    const emailDomain = company.createdBy.split('@')[1];
    const generic = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
    if (!generic.includes(emailDomain)) domain = emailDomain;
  }

  if (!domain) {
    console.log(`⚠️  ${company.name} — no domain, skipping`);
    continue;
  }

  const clearbitUrl = `https://logo.clearbit.com/${domain}`;
  await sequelize.query(
    `UPDATE companies SET logo = :logo WHERE id = :id`,
    { replacements: { logo: clearbitUrl, id: company.id } }
  );

  console.log(`✅ ${company.name} → ${clearbitUrl}`);
  updated++;
}

console.log(`\nDone! Updated ${updated} of ${companies.length} companies`);
await sequelize.close();
