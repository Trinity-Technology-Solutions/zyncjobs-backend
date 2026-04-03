import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'zyncjobs',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

const INDEXES = [
  // profiles
  `CREATE INDEX IF NOT EXISTS idx_profiles_userId ON profiles ("userId")`,
  `CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (email)`,
  // notifications
  `CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications ("userId")`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_userId_read ON notifications ("userId", read)`,
  // skill_assessments
  `CREATE INDEX IF NOT EXISTS idx_skill_assessments_userId ON skill_assessments ("userId")`,
  `CREATE INDEX IF NOT EXISTS idx_skill_assessments_userId_skill ON skill_assessments ("userId", skill)`,
  // users
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`,
  `CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)`,
  `CREATE INDEX IF NOT EXISTS idx_users_isActive ON users ("isActive")`,
  // applications
  `CREATE INDEX IF NOT EXISTS idx_applications_jobId ON applications ("jobId")`,
  `CREATE INDEX IF NOT EXISTS idx_applications_candidateId ON applications ("candidateId")`,
  `CREATE INDEX IF NOT EXISTS idx_applications_candidateEmail ON applications ("candidateEmail")`,
  `CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status)`,
  // jobs
  `CREATE INDEX IF NOT EXISTS idx_jobs_isActive ON jobs ("isActive")`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_employerEmail ON jobs ("employerEmail")`,
];

const applyIndexes = async () => {
  // Migrate companyId column in reviews from UUID to TEXT if needed
  try {
    await sequelize.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='companyId') THEN
          ALTER TABLE reviews ALTER COLUMN "companyId" TYPE TEXT USING "companyId"::TEXT;
          ALTER TABLE reviews ALTER COLUMN "companyId" DROP NOT NULL;
        END IF;
      END $$;
    `);
    console.log('✅ reviews.companyId migration applied');
  } catch (e) {
    console.warn('⚠️  reviews migration warning:', e.message);
  }

  // Add missing columns to jobs if missing
  try {
    await sequelize.query(`
      ALTER TABLE jobs
        ADD COLUMN IF NOT EXISTS "jobCategory" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "languages" VARCHAR(255)[],
        ADD COLUMN IF NOT EXISTS "experienceRange" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "country" VARCHAR(255);
        ADD COLUMN IF NOT EXISTS "languages" VARCHAR(255)[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS "experienceRange" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "country" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "jobHeaderImage" VARCHAR(255);
    `);
    console.log('✅ jobs columns verified');
  } catch (e) {
    console.warn('⚠️  jobs migration warning:', e.message);
  }

  for (const sql of INDEXES) {
    try {
      await sequelize.query(sql);
    } catch (e) {
      // Table may not exist yet — skip silently
      if (!e.message.includes('does not exist')) {
        console.warn('⚠️  Index warning:', e.message);
      }
    }
  }
  console.log('✅ DB indexes verified');
};

const connectPostgreSQL = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL Connected successfully');

    // Auto-create companies table if it doesn't exist
    try {
      const { default: Company } = await import('../models/Company.js');
      await Company.sync({ alter: true });
      console.log('✅ companies table synced');
    } catch (e) {
      console.warn('⚠️  companies table sync warning:', e.message);
    }

    await applyIndexes();
    return sequelize;
  } catch (error) {
    console.error('❌ PostgreSQL connection error:', error.message);
    throw error;
  }
};

export { sequelize };
export default connectPostgreSQL;
