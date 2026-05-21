/**
 * Run this on production to fix team members' employerOwnerId
 * Usage: node scripts/fix-team-employerids.js
 */
import { sequelize } from '../config/postgresql.js';

async function fixTeamEmployerIds() {
  try {
    console.log('🔧 Fixing team member employerOwnerId...\n');

    // Check if employerOwnerId column exists, add if not
    try {
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "employerOwnerId" VARCHAR(255)`);
      console.log('✅ employerOwnerId column ready\n');
    } catch (e) {
      console.log('ℹ️  Column already exists\n');
    }

    // Get all team_members records grouped by owner
    const [teamMembers] = await sequelize.query(
      `SELECT DISTINCT "employerId" FROM team_members`
    );

    for (const { employerId } of teamMembers) {
      // Get all active members under this owner (excluding owner themselves)
      const [members] = await sequelize.query(
        `SELECT "memberEmail", role, status FROM team_members 
         WHERE "employerId" = :eid AND "memberEmail" != :eid`,
        { replacements: { eid: employerId } }
      );

      if (!members.length) continue;

      console.log(`\n👤 Owner: ${employerId} → ${members.length} member(s)`);

      for (const member of members) {
        // Set employerOwnerId on the member's user record
        await sequelize.query(
          `UPDATE users SET "employerOwnerId" = :ownerEmail WHERE email = :memberEmail`,
          { replacements: { ownerEmail: employerId, memberEmail: member.memberEmail } }
        );

        // Ensure team_member status is active
        await sequelize.query(
          `UPDATE team_members SET status = 'active', "inviteToken" = NULL 
           WHERE "memberEmail" = :memberEmail AND "employerId" = :eid`,
          { replacements: { memberEmail: member.memberEmail, eid: employerId } }
        );

        console.log(`  ✅ ${member.memberEmail} → employerOwnerId = ${employerId}, status = active`);
      }
    }

    // Verify
    console.log('\n📊 Verification:');
    const [verify] = await sequelize.query(
      `SELECT email, "employerOwnerId" FROM users 
       WHERE "employerOwnerId" IS NOT NULL ORDER BY email`
    );
    console.log(JSON.stringify(verify, null, 2));

    console.log('\n✅ Done! Restart the backend server.');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

fixTeamEmployerIds();
