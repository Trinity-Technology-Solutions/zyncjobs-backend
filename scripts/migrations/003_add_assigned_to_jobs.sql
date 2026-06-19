-- Migration: Add assignedTo column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "assignedTo" VARCHAR(255) DEFAULT NULL;
