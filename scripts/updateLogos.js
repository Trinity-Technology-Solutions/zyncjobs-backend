import { sequelize } from '../config/postgresql.js';
import Company from '../models/Company.js';

const COMPANY_LOGOS = {
  'Infosys': {
    domain: 'infosys.com',
    logo: 'https://www.google.com/s2/favicons?domain=infosys.com&sz=128'
  },
  'zoho': {
    domain: 'zoho.com', 
    logo: 'https://www.google.com/s2/favicons?domain=zoho.com&sz=128'
  },
  'Nambikkai India': {
    domain: 'nambikkaiindia.com',
    logo: 'https://www.google.com/s2/favicons?domain=nambikkaiindia.com&sz=128'
  }
};

async function updateCompanyLogos() {
  try {
    console.log('Starting company logo update...');
    
    const companies = await Company.findAll();
    let updatedCount = 0;
    
    for (const company of companies) {
      const companyName = company.name;
      const logoData = COMPANY_LOGOS[companyName];
      
      if (logoData) {
        await company.update({
          domain: logoData.domain,
          logo: logoData.logo
        });
        
        console.log(`Updated ${companyName} with logo`);
        updatedCount++;
      }
    }
    
    console.log(`Updated ${updatedCount} companies with logos`);
    
  } catch (error) {
    console.error('Error updating company logos:', error);
  }
}

updateCompanyLogos().then(() => {
  console.log('Company logo update completed');
  process.exit(0);
}).catch(error => {
  console.error('Update failed:', error);
  process.exit(1);
});