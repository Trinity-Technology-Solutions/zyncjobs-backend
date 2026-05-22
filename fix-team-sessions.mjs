// Run this script to force-fix team member sessions in production
// node fix-team-sessions.mjs

import { sequelize } from './config/postgresql.js';

const TEAM_EMAILS = ['antony@trinitetech.com', 'annie.e@trinitetech.com'];

console.log('Fixing team member records...');

// 1. Verify employerOwnerId is set correctly
const users = await sequelize.query(
  `SELECT id, email, "employerOwnerId", "companyName" FROM users WHERE email = ANY(:emails)`,
  { replacements: { emails: TEAM_EMAILS }, type: 'SELECT' }
);

console.log('\nCurrent user records:');
users.forEach(u => console.log(` ${u.email} -> employerOwnerId: ${u.employerOwnerId}`));

// 2. Fix any missing employerOwnerId
for (const user of users) {
  if (!user.employerOwnerId) {
    const tm = await sequelize.query(
      `SELECT "employerId" FROM team_members WHERE "memberEmail" = :email LIMIT 1`,
      { replacements: { email: user.email }, type: 'SELECT' }
    );
    if (tm[0]?.employerId) {
      await sequelize.query(
        `UPDATE users SET "employerOwnerId" = :ownerId WHERE id = :id`,
        { replacements: { ownerId: tm[0].employerId, id: user.id } }
      );
      console.log(` FIXED: ${user.email} -> employerOwnerId = ${tm[0].employerId}`);
    }
  } else {
    console.log(` OK: ${user.email} -> employerOwnerId = ${user.employerOwnerId}`);
  }
}

// 3. Verify team_members table
const teams = await sequelize.query(
  `SELECT "employerId", "memberEmail", role, status FROM team_members WHERE "memberEmail" = ANY(:emails)`,
  { replacements: { emails: TEAM_EMAILS }, type: 'SELECT' }
);
console.log('\nTeam member records:');
teams.forEach(t => console.log(` ${t.memberEmail} -> role: ${t.role}, owner: ${t.employerId}, status: ${t.status}`));

console.log('\nDone. Team members will get correct dashboard on next login.');
process.exit(0);
