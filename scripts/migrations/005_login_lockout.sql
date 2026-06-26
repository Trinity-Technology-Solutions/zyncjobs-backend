-- Migration: Login lockout fields for users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "accountLockedUntil" TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastFailedLogin" TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastSuccessfulLogin" TIMESTAMPTZ DEFAULT NULL;

-- Ensure all existing users start with clean state
UPDATE users
SET "failedLoginAttempts" = 0,
    "accountLockedUntil" = NULL
WHERE "failedLoginAttempts" IS NULL;
