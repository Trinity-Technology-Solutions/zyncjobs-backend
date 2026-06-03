/**
 * One-time script to connect Google Calendar for Google Meet link creation.
 *
 * BEFORE running:
 *   1. Stop your backend server (Ctrl+C) — this script needs port 5000
 *   2. Run: node scripts/connectGoogleMeet.js
 *   3. Complete Google login in the browser
 *   4. Restart your backend server
 */

import 'dotenv/config';
import http from 'http';
import { google } from 'googleapis';
import { sequelize } from '../config/postgresql.js';
import { exec } from 'child_process';

const CLIENT_ID     = process.env.GOOGLE_MEET_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_MEET_CLIENT_SECRET;
// ⚠️ Must exactly match what is in Google Cloud Console Authorized redirect URIs
const REDIRECT_URI  = 'http://localhost:5000/api/meetings/google-meet/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ GOOGLE_MEET_CLIENT_ID or GOOGLE_MEET_CLIENT_SECRET missing in .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar'
  ],
  prompt: 'consent'   // forces refresh_token to be returned every time
});

console.log('\n===== Google Meet OAuth Setup =====\n');
console.log('⚠️  Make sure your backend server is STOPPED before running this.\n');
console.log('Opening browser for Google authorization...');
console.log('If browser does not open, paste this URL:\n');
console.log(authUrl + '\n');

const openCmd = process.platform === 'win32' ? `start "" "${authUrl}"` : `open "${authUrl}"`;
exec(openCmd);

// Minimal HTTP server that handles ONLY the Google callback path
const server = http.createServer(async (req, res) => {
  // Ignore favicon etc
  if (!req.url.startsWith('/api/meetings/google-meet/callback')) {
    res.writeHead(404); res.end(); return;
  }

  const url   = new URL(req.url, 'http://localhost:5000');
  const code  = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    console.error('❌ Google returned error:', error);
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>❌ Error: ${error}</h2><p>Close this tab and check terminal.</p>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h2>❌ No code received</h2>');
    server.close();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2>✅ Authorization successful!</h2>
      <p>Google Calendar connected. You can close this tab and restart your backend server.</p>
    </body></html>
  `);

  server.close();

  try {
    console.log('✅ Auth code received, exchanging for tokens...');
    const { tokens } = await oauth2Client.getToken(code);

    console.log('✅ Tokens received:');
    console.log('   access_token :', tokens.access_token ? tokens.access_token.substring(0, 30) + '...' : '❌ MISSING');
    console.log('   refresh_token:', tokens.refresh_token ? tokens.refresh_token.substring(0, 30) + '...' : '❌ MISSING');

    if (!tokens.refresh_token) {
      console.warn('\n⚠️  No refresh_token received!');
      console.warn('   Fix: Go to https://myaccount.google.com/permissions');
      console.warn('   Remove ZyncJobs access, then run this script again.\n');
    }

    await sequelize.authenticate();
    console.log('✅ DB connected');

    // Try to find employer users first
    const employers = await sequelize.query(
      `SELECT id, email FROM users WHERE "userType" = 'employer' OR role = 'employer' ORDER BY "createdAt" ASC LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT }
    );

    let targetUser = employers[0];

    // Fallback to first user if no employer found
    if (!targetUser) {
      const allUsers = await sequelize.query(
        `SELECT id, email FROM users ORDER BY "createdAt" ASC LIMIT 1`,
        { type: sequelize.QueryTypes.SELECT }
      );
      targetUser = allUsers[0];
    }

    if (!targetUser) {
      console.error('❌ No users found in DB. Cannot save token.');
      process.exit(1);
    }

    await sequelize.query(
      `UPDATE users SET "googleMeetAccessToken" = :at, "googleMeetRefreshToken" = :rt WHERE id = :id`,
      {
        replacements: {
          at: tokens.access_token,
          rt: tokens.refresh_token || null,
          id: targetUser.id
        }
      }
    );

    console.log(`\n✅ Token saved for: ${targetUser.email} (id: ${targetUser.id})`);
    console.log('\n🎉 Google Meet is now ready!');
    console.log('   Restart your backend, then run: node scripts/testMeetingLink.js\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  process.exit(0);
});

server.listen(5000, () => {
  console.log('Waiting for Google callback on http://localhost:5000 ...\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('❌ Port 5000 is already in use!');
    console.error('   Your backend server is still running.');
    console.error('   Stop it with Ctrl+C first, then run this script again.\n');
  } else {
    console.error('❌ Server error:', err.message);
  }
  process.exit(1);
});
