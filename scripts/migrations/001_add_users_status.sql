-- Migration: add `status` column to `users` table (safe, idempotent)
-- Creates enum type `enum_users_status` if missing, then adds the column with default 'active'

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_status') THEN
    CREATE TYPE enum_users_status AS ENUM ('active','suspended','deleted');
  END IF;
END$$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status enum_users_status NOT NULL DEFAULT 'active';

-- End migration
