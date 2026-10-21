'use strict';

// Additive, repeatable schema repair. Does not rewrite existing candidates/batches.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      const sql = statements => queryInterface.sequelize.query(statements, { transaction });
      await sql('SELECT pg_advisory_xact_lock(726401021)');
      await sql(`CREATE UNIQUE INDEX IF NOT EXISTS idx_talent_candidates_candidate_id ON talent_candidates (candidate_id)`);
      await sql(`CREATE TABLE IF NOT EXISTS submission_batches (
        id UUID PRIMARY KEY,
        batch_id VARCHAR(30) UNIQUE NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        job_title VARCHAR(255),
        submitted_by UUID REFERENCES users(id),
        submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        candidate_count INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Submitted',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await sql(`CREATE TABLE IF NOT EXISTS candidate_submissions (
        id UUID PRIMARY KEY,
        batch_id UUID NOT NULL REFERENCES submission_batches(id) ON DELETE CASCADE,
        candidate_id VARCHAR(20) NOT NULL REFERENCES talent_candidates(candidate_id),
        candidate_name VARCHAR(255),
        candidate_email VARCHAR(255),
        status VARCHAR(50) DEFAULT 'submitted',
        submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        shortlisted_at TIMESTAMPTZ,
        rejected_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(batch_id, candidate_id)
      )`);
      await sql('CREATE INDEX IF NOT EXISTS idx_submission_batches_client ON submission_batches(client_name)');
      await sql('CREATE INDEX IF NOT EXISTS idx_candidate_submissions_batch ON candidate_submissions(batch_id)');
      await sql('CREATE INDEX IF NOT EXISTS idx_candidate_submissions_candidate ON candidate_submissions(candidate_id)');
    });
  },
  async down() {
    throw new Error('This data-preserving schema repair has no automatic destructive rollback.');
  },
};
