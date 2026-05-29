import { sequelize } from '../config/postgresql.js';
import Company from '../models/Company.js';

async function updateInfosysLogo() {
  try {
    console.log('🔄 Updating Infosys logo...');
    
    // Update Infosys logo to use Clearbit
    const [updatedCount] = await Company.update(
      { 
        logo: 'https://logo.clearbit.com/infosys.com',
        domain: 'infosys.com'
      },
      { 
        where: { 
          name: 'Infosys' 
        } 
      }
    );
    
    console.log(`✅ Updated ${updatedCount} Infosys record(s)`);
    
    // Also update other companies with better logos
    const companyUpdates = [
      { name: 'zoho', logo: 'https://logo.clearbit.com/zoho.com', domain: 'zoho.com' },
      { name: 'Zoho', logo: 'https://logo.clearbit.com/zoho.com', domain: 'zoho.com' },
      { name: 'Trinity Technology Solutions', logo: '/images/trinity-logo.webp', domain: 'trinitetech.com' },
      { name: 'Nambikkai India', logo: 'https://logo.clearbit.com/nambikkaiindia.org', domain: 'nambikkaiindia.org' }
    ];
    
    for (const update of companyUpdates) {
      const [count] = await Company.update(
        { logo: update.logo, domain: update.domain },
        { where: { name: update.name } }
      );
      console.log(`✅ Updated ${count} ${update.name} record(s)`);
    }
    
    console.log('🎉 Logo updates completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating logos:', error);
    process.exit(1);
  }
}

updateInfosysLogo();