import { sequelize } from '../config/postgresql.js';
import Company from '../models/Company.js';

async function updateAllLogosToFavicon() {
  try {
    console.log('🔄 Updating all company logos to use reliable favicon service...');
    
    // Update all companies with reliable favicon URLs
    const companyUpdates = [
      { name: 'Infosys', logo: 'https://www.google.com/s2/favicons?domain=infosys.com&sz=128', domain: 'infosys.com' },
      { name: 'zoho', logo: 'https://www.google.com/s2/favicons?domain=zoho.com&sz=128', domain: 'zoho.com' },
      { name: 'Zoho', logo: 'https://www.google.com/s2/favicons?domain=zoho.com&sz=128', domain: 'zoho.com' },
      { name: 'Trinity Technology Solutions', logo: '/images/trinity-logo.webp', domain: 'trinitetech.com' },
      { name: 'Nambikkai India', logo: 'https://www.google.com/s2/favicons?domain=nambikkaiindia.org&sz=128', domain: 'nambikkaiindia.org' }
    ];
    
    for (const update of companyUpdates) {
      const [count] = await Company.update(
        { logo: update.logo, domain: update.domain },
        { where: { name: update.name } }
      );
      console.log(`✅ Updated ${count} ${update.name} record(s) with favicon logo`);
    }
    
    console.log('🎉 All logo updates completed with reliable favicon service!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating logos:', error);
    process.exit(1);
  }
}

updateAllLogosToFavicon();