/**
 * connectGoogleCalendar.js
 * Run: node scripts/connectGoogleCalendar.js
 * STOP your backend server first (port 5000 must be free)
 */

import 'dotenv/config';
import http from 'http';
import { google } from 'googleapis';
import { sequelize } from '../config/postgresql.js';
import { exec } from 'child_process';

const CLIENT_ID     = process.env.GOOGLE_MEET_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_MEET_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:5000/api/meetings/google-meet/callback';

console.log('\n===== Google Calendar Connect Script =====');
console.log('Client ID    :', CLIENT_ID ? CLIENT_ID.substring(0, 40) + '...' : '❌ MISSING');
console.log('Client Secret:', CLIENT_SECRET ? '✅ set' : '❌ MISSING');
console.log('Redirect URI :', REDIRECT_URI);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌ Missing credentials in .env — check GOOGLE_MEET_CLIENT_ID and GOOGLE_MEET_CLIENT_SECRET');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ]
});

console.log('\n📋 Auth URL:\n' + authUrl + '\n');

// Open browser
const open = process.platform === 'win32' ? `start "" "${authUrl}"` : `open "${authUrl}"`;
exec(open, (err) => { if (err) console.log('Could not open browser automatically — paste the URL above manually'); });

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/api/meetings/google-meet/callback')) {
    res.writeHead(200); res.end('waiting...'); return;
  }

  const params = new URL(req.url, 'http://localhost:5000').searchParams;
  const code   = params.get('code');
  const error  = params.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2 style="color:red">Error: ${error}</h2><p>Check your terminal.</p>`);
    console.error('\n❌ Google returned error:', error);
    server.close(); process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h2>No code — try again</h2>');
    server.close(); return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html><body style="font-family:sans-serif;max-width:500px;margin:60px auto;text-align:center">
      <h2 style="color:green">✅ Connected!</h2>
      <p>Google Calendar connected successfully.<br>Close this tab and restart your backend server.</p>
    </body></html>
  `);
  server.close();

  console.log('\n✅ Auth code received — exchanging for tokens...');

  try {
    const { tokens } = await oauth2Client.getToken(code);

    console.log('access_token :', tokens.access_token ? '✅ received' : '❌ missing');
    console.log('refresh_token:', tokens.refresh_token ? '✅ received' : '⚠️  missing (revoke app access and retry)');
    console.log('expiry_date  :', tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'N/A');

    if (!tokens.access_token) {
      console.error('❌ No access token received'); process.exit(1);
    }

    await sequelize.authenticate();
    console.log('\n✅ DB connected — saving token...');

    // Find first employer user
    const [rows] = await sequelize.query(
      `SELECT id, email FROM users WHERE "userType" = 'employer' OR role = 'employer' ORDER BY "createdAt" ASC LIMIT 1`
    );
    const user = Array.isArray(rows) ? rows[0] : rows;

    if (!user) {
      // Fallback: save to first user in DB
      const [allRows] = await sequelize.query(`SELECT id, email FROM users ORDER BY "createdAt" ASC LIMIT 1`);
      const firstUser = Array.isArray(allRows) ? allRows[0] : allRows;
      if (!firstUser) { console.error('❌ No users in DB'); process.exit(1); }

      await sequelize.query(
        `UPDATE users SET "googleMeetAccessToken"=:at, "googleMeetRefreshToken"=:rt WHERE id=:id`,
        { replacements: { at: tokens.access_token, rt: tokens.refresh_token || null, id: firstUser.id } }
      );
      console.log(`\n✅ Token saved → ${firstUser.email}`);
    } else {
      await sequelize.query(
        `UPDATE users SET "googleMeetAccessToken"=:at, "googleMeetRefreshToken"=:rt WHERE id=:id`,
        { replacements: { at: tokens.access_token, rt: tokens.refresh_token || null, id: user.id } }
      );
      console.log(`\n✅ Token saved → ${user.email}`);
    }

    console.log('\n🎉 Done! Now:');
    console.log('   1. Restart backend:  npm run dev');
    console.log('   2. Test:             node scripts/testMeetingLink.js\n');
  } catch (err) {
    console.error('❌ Failed:', err.message);
  }
  process.exit(0);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n❌ Port 5000 is busy — your backend is still running!');
    console.error('   Stop it with Ctrl+C, then run this script again.\n');
  } else {
    console.error('❌ Server error:', err.message);
  }
  process.exit(1);
});

server.listen(5000, () => {
  console.log('\n⏳ Waiting for Google to redirect to http://localhost:5000...');
  console.log('   Complete the Google login in your browser.\n');
});
