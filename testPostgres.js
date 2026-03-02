import connectPostgreSQL from './config/postgresql.js';
import User from './models/User.js';
import Job from './models/Job.js';
import Application from './models/Application.js';
import Interview from './models/Interview.js';

async function testConnection() {
  try {
    console.log('🔄 Testing PostgreSQL connection...\n');
    
    await connectPostgreSQL();
    
    console.log('\n✅ All models created successfully!');
    console.log('\n📊 Database Tables:');
    console.log('   - users');
    console.log('   - jobs');
    console.log('   - applications');
    console.log('   - interviews');
    
    console.log('\n🎉 PostgreSQL setup complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Update your .env file with PostgreSQL password');
    console.log('   2. Run: node backend/testPostgres.js');
    console.log('   3. Start migrating your routes');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   1. PostgreSQL is running');
    console.log('   2. Database "jobportal" exists');
    console.log('   3. Password in .env is correct');
    process.exit(1);
  }
}

testConnection();
