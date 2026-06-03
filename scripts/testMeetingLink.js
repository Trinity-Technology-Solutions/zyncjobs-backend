/**
 * Run this to diagnose Google Meet / Zoom meeting link issues:
 *   node scripts/testMeetingLink.js
 */
import 'dotenv/config';
import { meetingService } from '../services/meetingService.js';
import { sequelize } from '../config/postgresql.js';

async function diagnose() {
  console.log('\n===== MEETING LINK DIAGNOSTIC =====\n');

  // 1. Check env vars
  console.log('--- Environment Variables ---');
  console.log('GOOGLE_MEET_CLIENT_ID   :', process.env.GOOGLE_MEET_CLIENT_ID ? '✅ set' : '❌ MISSING');
  console.log('GOOGLE_MEET_CLIENT_SECRET:', process.env.GOOGLE_MEET_CLIENT_SECRET ? '✅ set' : '❌ MISSING');
  console.log('GOOGLE_MEET_REDIRECT_URI :', process.env.GOOGLE_MEET_REDIRECT_URI || '❌ MISSING');
  console.log('ZOOM_ACCOUNT_ID          :', process.env.ZOOM_ACCOUNT_ID ? '✅ set' : '❌ MISSING');
  console.log('ZOOM_CLIENT_ID           :', process.env.ZOOM_CLIENT_ID ? '✅ set' : '❌ MISSING');
  console.log('ZOOM_CLIENT_SECRET       :', process.env.ZOOM_CLIENT_SECRET ? '✅ set' : '❌ MISSING');

  // 2. Check DB for any stored Google OAuth tokens
  console.log('\n--- Google OAuth Tokens in DB ---');
  try {
    await sequelize.authenticate();
    const [rows] = await sequelize.query(
      'SELECT id, email, "googleMeetAccessToken", "googleMeetRefreshToken" FROM users WHERE "googleMeetAccessToken" IS NOT NULL LIMIT 5',
      { type: sequelize.QueryTypes.SELECT }
    );
    const accounts = Array.isArray(rows) ? rows : (rows ? [rows] : []);
    if (!accounts.length) {
      console.log('❌ NO Google OAuth tokens found in DB');
      console.log('   → No employer has connected Google Calendar yet');
      console.log('   → Google Meet link creation WILL FAIL');
      console.log('   → Fix: Go to employer dashboard → Connect Google Calendar');
    } else {
      console.log(`✅ Found ${accounts.length} connected Google account(s):`);
      accounts.forEach(a => {
        const token = a.googleMeetAccessToken;
        console.log(`   • ${a.email} — token: ${token ? token.substring(0, 20) + '...' : 'null'}, refresh: ${a.googleMeetRefreshToken ? '✅' : '❌ missing'}`);
      });
    }
  } catch (err) {
    console.log('❌ DB error:', err.message);
  }

  // 3. Try creating a real Google Meet
  console.log('\n--- Test Google Meet Creation ---');
  const meetResult = await meetingService.createGoogleMeet({
    topic: 'Test Interview - Diagnostic',
    start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    duration: 30,
    description: 'Diagnostic test meeting'
  });

  if (meetResult.success) {
    const link = meetResult.meeting?.join_url || meetResult.meeting?.meetLink;
    console.log('✅ Google Meet created successfully!');
    console.log('   Meet link:', link);
    if (meetResult.fallback) {
      console.log('⚠️  WARNING: This is a FAKE fallback link — it will NOT work!');
    } else {
      console.log('✅ This is a REAL Google Meet link');
    }
  } else {
    console.log('❌ Google Meet creation FAILED:', meetResult.error);
    if (meetResult.error?.includes('not connected')) {
      console.log('\n   FIX: An employer must connect their Google Calendar:');
      console.log(`   → Visit: ${process.env.BACKEND_URL}/api/meetings/google-meet/connect?employerId=<employer_id>`);
    } else if (meetResult.error?.includes('invalid_grant') || meetResult.error?.includes('Token has been expired')) {
      console.log('\n   FIX: Google OAuth token expired — employer must reconnect Google Calendar');
    }
  }

  // 4. Test Zoom
  console.log('\n--- Test Zoom Meeting Creation ---');
  const zoomResult = await meetingService.createZoomMeeting({
    topic: 'Test Interview - Diagnostic',
    start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    duration: 30
  });

  if (zoomResult.success && !zoomResult.fallback) {
    console.log('✅ Real Zoom meeting created!');
    console.log('   Join URL:', zoomResult.meeting?.join_url);
  } else if (zoomResult.fallback) {
    console.log('⚠️  Zoom returned a FAKE fallback link — Zoom credentials not configured properly');
    console.log('   Fake URL:', zoomResult.meeting?.join_url);
  } else {
    console.log('❌ Zoom creation failed:', zoomResult.error);
  }

  console.log('\n===== DIAGNOSIS COMPLETE =====\n');
  process.exit(0);
}

diagnose().catch(err => {
  console.error('Diagnostic crashed:', err);
  process.exit(1);
});
