-- Fix verification status enum conflict
-- Run this: psql -U postgres -d your_database_name -f fix-enum.sql

BEGIN;

-- Step 1: Drop old enum types
DROP TYPE IF EXISTS verification_status_enum CASCADE;
DROP TYPE IF EXISTS "enum_users_verificationStatus" CASCADE;

-- Step 2: Convert column to text temporarily
ALTER TABLE users ALTER COLUMN "verificationStatus" TYPE TEXT;

-- Step 3: Create new enum type
CREATE TYPE "enum_users_verificationStatus" AS ENUM('pending', 'verified', 'rejected');

-- Step 4: Convert column back to enum with safe casting
ALTER TABLE users 
ALTER COLUMN "verificationStatus" 
TYPE "enum_users_verificationStatus" 
USING (
  CASE 
    WHEN "verificationStatus" IN ('pending', 'verified', 'rejected') 
    THEN "verificationStatus"::"enum_users_verificationStatus"
    ELSE 'verified'::"enum_users_verificationStatus"
  END
);

-- Step 5: Set default value
ALTER TABLE users ALTER COLUMN "verificationStatus" SET DEFAULT 'verified';

-- Step 6: Update any NULL values to verified
UPDATE users SET "verificationStatus" = 'verified' WHERE "verificationStatus" IS NULL;

COMMIT;

-- Verify the change
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'verificationStatus';

SELECT "verificationStatus", COUNT(*) 
FROM users 
GROUP BY "verificationStatus";
