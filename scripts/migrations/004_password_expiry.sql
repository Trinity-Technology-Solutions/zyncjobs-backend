-- Migration: Password expiry fields for users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastPasswordChange" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordExpiryDays" INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordHistory" JSONB DEFAULT '[]';

-- Set 90-day expiry for existing admins
UPDATE users
SET "lastPasswordChange" = NOW(),
    "passwordExpiryDays" = 90,
    "mustChangePassword" = FALSE,
    "passwordHistory" = '[]'
WHERE role IN ('admin', 'super_admin')
  AND "passwordExpiryDays" IS NULL OR "passwordExpiryDays" = 0;

-- Ensure regular users have no expiry
UPDATE users
SET "passwordExpiryDays" = 0,
    "mustChangePassword" = FALSE
WHERE role IN ('candidate', 'employer', 'manager')
  AND ("passwordExpiryDays" IS NULL OR "passwordExpiryDays" != 0);
