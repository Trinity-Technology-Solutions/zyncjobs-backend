import { sequelize } from '../config/postgresql.js';
import Company from '../models/Company.js';
import CompanyProfile from '../models/CompanyProfile.js';

async function migrateCompanyProfiles() {
  console.log('🔄 Starting company profiles migration...');
  
  try {
    // Sync the database to create new tables and columns
    await sequelize.sync({ alter: true });
    console.log('✅ Database schema updated');
    
    // Create associations
    Company.hasOne(CompanyProfile, {
      foreignKey: 'companyId',
      as: 'profile'
    });
    
    CompanyProfile.belongsTo(Company, {
      foreignKey: 'companyId',
      as: 'company'
    });
    
    console.log('✅ Model associations created');
    
    // Check if we need to create default profiles for existing companies
    const companiesWithoutProfiles = await Company.findAll({
      include: [{
        model: CompanyProfile,
        as: 'profile',
        required: false
      }],
      where: {
        '$profile.id$': null
      }
    });
    
    if (companiesWithoutProfiles.length > 0) {
      console.log(`📝 Creating default profiles for ${companiesWithoutProfiles.length} companies...`);
      
      for (const company of companiesWithoutProfiles) {
        await CompanyProfile.create({
          companyId: company.id,
          description: company.description || '',
          industry: company.industry || '',
          headquarters: company.location || '',
          website: company.website || '',
          logoUrl: company.logo || ''
        });
      }
      
      console.log('✅ Default profiles created');
    }
    
    console.log('🎉 Company profiles migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateCompanyProfiles()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { migrateCompanyProfiles };