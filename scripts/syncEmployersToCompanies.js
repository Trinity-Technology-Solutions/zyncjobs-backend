import { sequelize } from '../config/postgresql.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import { Op } from 'sequelize';

// Script to sync existing employer users to companies table
async function syncEmployersToCompanies() {
  try {
    console.log('🔄 Starting employer to company sync...');
    
    // Get all active employers who have company names
    const employers = await User.findAll({
      where: {
        role: 'employer',
        isActive: true,
        [Op.or]: [
          { companyName: { [Op.ne]: null } },
          { company: { [Op.ne]: null } }
        ]
      }
    });
    
    console.log(`📊 Found ${employers.length} employers to sync`);
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const employer of employers) {
      const companyName = employer.companyName || employer.company;
      
      if (!companyName || companyName.trim() === '') {
        skipped++;
        continue;
      }
      
      try {
        // Check if company already exists
        const [company, wasCreated] = await Company.findOrCreate({
          where: { name: { [Op.iLike]: companyName.trim() } },
          defaults: {
            name: companyName.trim(),
            domain: employer.email.split('@')[1],
            createdBy: employer.email,
            verified: employer.verificationStatus === 'verified',
            verificationStatus: employer.verificationStatus || 'pending',
            followers: [],
            // Add company data from user profile if available
            ...(employer.companyProfile && {
              industry: employer.companyProfile.industry,
              description: employer.companyProfile.description,
              size: employer.companyProfile.companySize,
              companySize: employer.companyProfile.companySize,
              location: employer.companyProfile.headquarters,
              headquarters: employer.companyProfile.headquarters,
              website: employer.companyWebsite || employer.companyProfile.website,
              companyWebsite: employer.companyWebsite || employer.companyProfile.website,
              logo: employer.companyLogo,
              tagline: employer.companyProfile.tagline,
              foundedYear: employer.companyProfile.foundedYear,
              companyType: employer.companyProfile.companyType || 'Private',
              benefits: employer.companyProfile.benefits || [],
              socialLinks: employer.companyProfile.socialLinks || {},
              additionalLocations: employer.companyProfile.locations || [],
              gstNumber: employer.companyProfile.gstNumber,
              cinNumber: employer.companyProfile.cinNumber,
              companyEmail: employer.companyProfile.companyEmail,
              phoneNumber: employer.companyProfile.phoneNumber,
              companyPhotos: employer.companyProfile.companyPhotos || []
            }),
            // Fallback data from user fields
            ...(employer.companyWebsite && { website: employer.companyWebsite, companyWebsite: employer.companyWebsite }),
            ...(employer.companyLogo && { logo: employer.companyLogo }),
            ...(employer.location && { location: employer.location })
          }
        });
        
        if (wasCreated) {
          created++;
          console.log(`✅ Created company: ${companyName} (${employer.email})`);
        } else {
          // Update existing company with any missing data
          const updateData = {};
          
          if (!company.createdBy && employer.email) {
            updateData.createdBy = employer.email;
          }
          
          if (!company.domain && employer.email.includes('@')) {
            updateData.domain = employer.email.split('@')[1];
          }
          
          if (Object.keys(updateData).length > 0) {
            await company.update(updateData);
            updated++;
            console.log(`🔄 Updated company: ${companyName}`);
          } else {
            skipped++;
            console.log(`⏭️ Skipped existing company: ${companyName}`);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing ${companyName}:`, error.message);
        skipped++;
      }
    }
    
    console.log('\n📊 Sync Results:');
    console.log(`✅ Created: ${created} companies`);
    console.log(`🔄 Updated: ${updated} companies`);
    console.log(`⏭️ Skipped: ${skipped} companies`);
    console.log(`📈 Total processed: ${employers.length} employers`);
    
    return { created, updated, skipped, total: employers.length };
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

// Run the sync if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncEmployersToCompanies()
    .then((result) => {
      console.log('🎉 Sync completed successfully!', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Sync failed:', error);
      process.exit(1);
    });
}

export { syncEmployersToCompanies };