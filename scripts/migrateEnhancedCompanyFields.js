import { sequelize } from '../config/postgresql.js';

/**
 * Migration script to add enhanced company profile fields to the companies table
 * Run this script to update existing database schema
 */

const migrateEnhancedCompanyFields = async () => {
  try {
    console.log('🚀 Starting enhanced company fields migration...');
    
    const queryInterface = sequelize.getQueryInterface();
    
    // Check if columns already exist to avoid errors
    const tableDescription = await queryInterface.describeTable('companies');
    
    const columnsToAdd = [
      {
        name: 'tagline',
        definition: {
          type: 'VARCHAR(255)',
          allowNull: true,
          comment: 'Company tagline or slogan'
        }
      },
      {
        name: 'foundedYear',
        definition: {
          type: 'VARCHAR(4)',
          allowNull: true,
          comment: 'Year company was founded'
        }
      },
      {
        name: 'companyType',
        definition: {
          type: 'VARCHAR(50)',
          allowNull: false,
          defaultValue: 'Private',
          comment: 'Type of company'
        }
      },
      {
        name: 'companySize',
        definition: {
          type: 'VARCHAR(100)',
          allowNull: true,
          comment: 'Number of employees range'
        }
      },
      {
        name: 'headquarters',
        definition: {
          type: 'VARCHAR(255)',
          allowNull: true,
          comment: 'Main office location'
        }
      },
      {
        name: 'companyWebsite',
        definition: {
          type: 'VARCHAR(255)',
          allowNull: true,
          comment: 'Official company website'
        }
      },
      {
        name: 'benefits',
        definition: {
          type: 'JSONB',
          allowNull: true,
          defaultValue: '[]',
          comment: 'Array of employee benefits'
        }
      },
      {
        name: 'socialLinks',
        definition: {
          type: 'JSONB',
          allowNull: true,
          defaultValue: '{}',
          comment: 'Social media links (linkedin, twitter, facebook)'
        }
      },
      {
        name: 'additionalLocations',
        definition: {
          type: 'JSONB',
          allowNull: true,
          defaultValue: '[]',
          comment: 'Array of additional office locations'
        }
      },
      {
        name: 'cinNumber',
        definition: {
          type: 'VARCHAR(21)',
          allowNull: true,
          comment: 'Corporate Identification Number'
        }
      },
      {
        name: 'companyEmail',
        definition: {
          type: 'VARCHAR(255)',
          allowNull: true,
          comment: 'Official company email'
        }
      },
      {
        name: 'phoneNumber',
        definition: {
          type: 'VARCHAR(20)',
          allowNull: true,
          comment: 'Company phone number'
        }
      },
      {
        name: 'companyPhotos',
        definition: {
          type: 'JSONB',
          allowNull: true,
          defaultValue: '[]',
          comment: 'Array of company photo URLs'
        }
      }
    ];
    
    // Add columns that don't exist
    for (const column of columnsToAdd) {
      if (!tableDescription[column.name]) {
        console.log(`➕ Adding column: ${column.name}`);
        await queryInterface.addColumn('companies', column.name, column.definition);
      } else {
        console.log(`✅ Column already exists: ${column.name}`);
      }
    }
    
    // Update existing records with default values for JSONB fields
    console.log('🔄 Updating existing records with default values...');
    
    await sequelize.query(`
      UPDATE companies 
      SET 
        benefits = COALESCE(benefits, '[]'::jsonb),
        "socialLinks" = COALESCE("socialLinks", '{}'::jsonb),
        "additionalLocations" = COALESCE("additionalLocations", '[]'::jsonb),
        "companyPhotos" = COALESCE("companyPhotos", '[]'::jsonb),
        "companyType" = COALESCE("companyType", 'Private')
      WHERE 
        benefits IS NULL 
        OR "socialLinks" IS NULL 
        OR "additionalLocations" IS NULL 
        OR "companyPhotos" IS NULL
        OR "companyType" IS NULL
    `);
    
    console.log('✅ Enhanced company fields migration completed successfully!');
    console.log('📊 Migration summary:');
    console.log(`   - Added ${columnsToAdd.length} new columns to companies table`);
    console.log('   - Updated existing records with default values');
    console.log('   - Enhanced company profile functionality is now available');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateEnhancedCompanyFields()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

export { migrateEnhancedCompanyFields };