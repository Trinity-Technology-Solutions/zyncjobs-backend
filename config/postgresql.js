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
    max: process.env.NODE_ENV === 'production' ? 20 : 10,
    min: process.env.NODE_ENV === 'production' ? 2 : 0,
    acquire: 60000,
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
  `CREATE INDEX IF NOT EXISTS idx_users_status ON users (status)`,
  // applications
  `CREATE INDEX IF NOT EXISTS idx_applications_jobId ON applications ("jobId")`,
  `CREATE INDEX IF NOT EXISTS idx_applications_candidateId ON applications ("candidateId")`,
  `CREATE INDEX IF NOT EXISTS idx_applications_candidateEmail ON applications ("candidateEmail")`,
  `CREATE INDEX IF NOT EXISTS idx_applications_employerEmail ON applications ("employerEmail")`,
  `CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status)`,
  `CREATE INDEX IF NOT EXISTS idx_applications_employerEmail_status ON applications ("employerEmail", status)`,
  `CREATE INDEX IF NOT EXISTS idx_applications_candidateEmail_status ON applications ("candidateEmail", status)`,
  // jobs
  `CREATE INDEX IF NOT EXISTS idx_jobs_isActive ON jobs ("isActive")`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_isActive_status ON jobs ("isActive", status)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_employerEmail ON jobs ("employerEmail")`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_createdAt ON jobs ("createdAt")`,
  // interviews
  `CREATE INDEX IF NOT EXISTS idx_interviews_candidateEmail ON interviews ("candidateEmail")`,
  `CREATE INDEX IF NOT EXISTS idx_interviews_employerEmail ON interviews ("employerEmail")`,
  `CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews (status)`,
  `CREATE INDEX IF NOT EXISTS idx_interviews_scheduledDate ON interviews ("scheduledDate")`,
  `CREATE INDEX IF NOT EXISTS idx_interviews_candidateEmail_status ON interviews ("candidateEmail", status)`,
  // messages
  `CREATE INDEX IF NOT EXISTS idx_messages_conversationId ON messages ("conversationId")`,
  `CREATE INDEX IF NOT EXISTS idx_messages_senderId ON messages ("senderId")`,
  `CREATE INDEX IF NOT EXISTS idx_messages_receiverId ON messages ("receiverId")`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conversationId_createdAt ON messages ("conversationId", "createdAt")`,
  // analytics
  `CREATE INDEX IF NOT EXISTS idx_analytics_email ON analytics (email)`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_userId ON analytics ("userId")`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_eventType ON analytics ("eventType")`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_email_eventType ON analytics (email, "eventType")`,
  // job_alerts
  `CREATE INDEX IF NOT EXISTS idx_job_alerts_userId ON job_alerts ("userId")`,
  `CREATE INDEX IF NOT EXISTS idx_job_alerts_email ON job_alerts (email)`,
  `CREATE INDEX IF NOT EXISTS idx_job_alerts_isActive ON job_alerts ("isActive")`,
  `CREATE INDEX IF NOT EXISTS idx_job_alerts_email_isActive ON job_alerts (email, "isActive")`,
  // resumes
  `CREATE INDEX IF NOT EXISTS idx_resumes_userId ON resumes ("userId")`,
  `CREATE INDEX IF NOT EXISTS idx_resumes_email ON resumes (email)`,
  // resume_versions
  `CREATE INDEX IF NOT EXISTS idx_resume_versions_userId ON resume_versions ("userId")`,
  `CREATE INDEX IF NOT EXISTS idx_resume_versions_resumeId ON resume_versions ("resumeId")`,
  // search_analytics
  `CREATE INDEX IF NOT EXISTS idx_search_analytics_userId ON search_analytics ("userId")`,
  `CREATE INDEX IF NOT EXISTS idx_search_analytics_email ON search_analytics (email)`,
  // team_members
  `CREATE INDEX IF NOT EXISTS idx_team_members_employerId ON team_members ("employerId")`,
  // reviews
  `CREATE INDEX IF NOT EXISTS idx_reviews_companyId ON reviews ("companyId")`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_companyName ON reviews ("companyName")`,
];

const applyIndexes = async () => {
  // Create audit_logs table
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action VARCHAR(100) NOT NULL,
        "adminId" VARCHAR(255) NOT NULL,
        "adminName" VARCHAR(255) DEFAULT '',
        "adminEmail" VARCHAR(255) DEFAULT '',
        "targetId" VARCHAR(255) DEFAULT '',
        "targetName" VARCHAR(255) DEFAULT '',
        details TEXT DEFAULT '',
        ip VARCHAR(100) DEFAULT '',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_createdAt ON audit_logs ("createdAt" DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_adminEmail ON audit_logs ("adminEmail");
    `);
    console.log('✅ audit_logs table ready');
  } catch (e) {
    console.warn('⚠️  audit_logs table warning:', e.message);
  }

  // Create reviews table if not exists
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "companyId" TEXT,
        "companyName" VARCHAR(255),
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title VARCHAR(255),
        review TEXT,
        "reviewerName" VARCHAR(255),
        "reviewerEmail" VARCHAR(255),
        "reviewerRole" VARCHAR(255),
        helpful INTEGER DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ reviews table ready');
  } catch (e) {
    console.warn('⚠️  reviews table warning:', e.message);
  }

  // Create companies table if not exists
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL UNIQUE,
        domain VARCHAR(255),
        logo VARCHAR(255),
        description TEXT,
        industry VARCHAR(255),
        size VARCHAR(255),
        website VARCHAR(255),
        location VARCHAR(255),
        followers JSONB DEFAULT '[]',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ companies table ready');
  } catch (e) {
    console.warn('⚠️  companies table warning:', e.message);
  }

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
  } catch (e) {
    console.warn('⚠️  reviews migration warning:', e.message);
  }

  // Create gdpr_consents table if not exists
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS gdpr_consents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" VARCHAR(255) NOT NULL UNIQUE,
        "consentTypes" TEXT[] DEFAULT '{}',
        "consentDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "storeResume" BOOLEAN DEFAULT true,
        "allowEmployerView" BOOLEAN DEFAULT true,
        "receiveJobAlerts" BOOLEAN DEFAULT true,
        "allowAIRecommendations" BOOLEAN DEFAULT true,
        "cookieNecessary" BOOLEAN DEFAULT true,
        "cookieAnalytics" BOOLEAN DEFAULT false,
        "cookieMarketing" BOOLEAN DEFAULT false,
        "cookieConsentDate" TIMESTAMP WITH TIME ZONE,
        "lastActiveAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "resumeUploadedAt" TIMESTAMP WITH TIME ZONE,
        "resumeStatus" VARCHAR(20) DEFAULT 'active' CHECK ("resumeStatus" IN ('active', 'reminded', 'deleted')),
        "reminderSentAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ gdpr_consents table ready');
  } catch (e) {
    console.warn('⚠️  gdpr_consents table warning:', e.message);
  }

  // Add pending_admin to verificationStatus enum if missing
  try {
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
          WHERE pg_type.typname = 'enum_users_verificationStatus'
          AND pg_enum.enumlabel = 'pending_admin'
        ) THEN
          ALTER TYPE "enum_users_verificationStatus" ADD VALUE 'pending_admin';
        END IF;
      END $$;
    `);
    console.log('\u2705 verificationStatus enum updated with pending_admin');
  } catch (e) {
    console.warn('\u26a0\ufe0f  verificationStatus enum warning:', e.message);
  }

  // Add missing columns to jobs if missing
  try {
    await sequelize.query(`
      ALTER TABLE jobs
        ADD COLUMN IF NOT EXISTS "jobCategory" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "languages" VARCHAR(255)[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS "experienceRange" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "country" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "jobHeaderImage" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "assignedTo" VARCHAR(255);
    `);
    console.log('✅ jobs columns verified');
  } catch (e) {
    console.warn('⚠️  jobs migration warning:', e.message);
  }

  // Add coverPhoto column to profiles if missing
  try {
    await sequelize.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "coverPhoto" VARCHAR(255);`);
    console.log('✅ profiles.coverPhoto column verified');
  } catch (e) {
    console.warn('⚠️  profiles coverPhoto migration warning:', e.message);
  }

  // Add jobTitle column to profiles if missing
  try {
    await sequelize.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "jobTitle" VARCHAR(255);`);
    console.log('✅ profiles.jobTitle column verified');
  } catch (e) {
    console.warn('⚠️  profiles jobTitle migration warning:', e.message);
  }

  // Add position column to team_members if missing
  try {
    await sequelize.query(`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS "position" VARCHAR(255) DEFAULT 'Recruiter';`);
    console.log('✅ team_members.position column verified');
  } catch (e) {
    console.warn('⚠️  team_members position migration warning:', e.message);
  }

  // Add position column to users if missing
  try {
    await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "position" VARCHAR(255);`);
    console.log('✅ users.position column verified');
  } catch (e) {
    console.warn('⚠️  users position migration warning:', e.message);
  }

  // Add verificationStatus column to users if missing
  try {
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='verificationStatus') THEN
          CREATE TYPE verification_status_enum AS ENUM ('pending', 'verified', 'rejected');
          ALTER TABLE users ADD COLUMN "verificationStatus" verification_status_enum DEFAULT 'pending';
        END IF;
      END $$;
    `);
    await sequelize.query(`
      UPDATE users SET "verificationStatus" = 'verified'
      WHERE role = 'employer' AND "emailVerified" = true AND "verificationStatus" IS NULL;
    `);
    console.log('✅ users.verificationStatus column verified');
  } catch (e) {
    console.warn('⚠️  users verificationStatus migration warning:', e.message);
  }

  // Add status column to users if missing
  try {
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_status') THEN
          CREATE TYPE enum_users_status AS ENUM ('active','suspended','deleted');
        END IF;
      END $$;
    `);
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS status enum_users_status NOT NULL DEFAULT 'active';
    `);
    console.log('✅ users.status column verified');
  } catch (e) {
    console.warn('⚠️  users.status migration warning:', e.message);
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

    // Auto-create AuditLog table if it doesn't exist
    try {
      const { default: AuditLog } = await import('../models/AuditLog.js');
      await AuditLog.sync({ alter: false });
      console.log('✅ audit_logs table synced');
    } catch (e) {
      console.warn('⚠️  audit_logs table sync warning:', e.message);
    }

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
