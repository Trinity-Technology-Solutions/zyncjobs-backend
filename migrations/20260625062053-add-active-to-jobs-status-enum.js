'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
          WHERE pg_type.typname = 'enum_jobs_status'
          AND pg_enum.enumlabel = 'active'
        ) THEN
          ALTER TYPE "enum_jobs_status" ADD VALUE 'active';
        END IF;
      END $$;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_enum
          JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
          WHERE pg_type.typname = 'enum_jobs_status'
          AND pg_enum.enumlabel = 'active'
        ) THEN
          -- Cannot easily remove enum values in PostgreSQL if used
          -- This is a manual step if needed
          RAISE NOTICE 'Cannot auto-remove enum value "active" - manual cleanup required';
        END IF;
      END $$;
    `);
  }
};