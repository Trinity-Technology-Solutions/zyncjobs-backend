-- Migration: Fix resume upload for normal login + Google OAuth users
-- Run this once against your PostgreSQL database

-- 1. Add resumeUrl column to profiles table (missing field causing silent save failures)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "resumeUrl" VARCHAR(255);

-- 2. Make userId nullable in resumes table (Google OAuth users may not have UUID resolved at upload time)
ALTER TABLE resumes ALTER COLUMN "userId" DROP NOT NULL;
