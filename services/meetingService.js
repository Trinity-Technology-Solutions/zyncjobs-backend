import axios from 'axios';
import { google } from 'googleapis';
import { sequelize } from '../config/postgresql.js';
import crypto from 'crypto';

class MeetingService {
  constructor() {
    this.zoomConfig = {
      accountId: process.env.ZOOM_ACCOUNT_ID,
      clientId: process.env.ZOOM_CLIENT_ID,
      clientSecret: process.env.ZOOM_CLIENT_SECRET,
      secretToken: process.env.ZOOM_SECRET_TOKEN
    };
    this.googleMeetConfig = {
      clientId: process.env.GOOGLE_MEET_CLIENT_ID,
      clientSecret: process.env.GOOGLE_MEET_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_MEET_REDIRECT_URI || `${process.env.BACKEND_URL}/api/auth/google/meet/callback`
    };
  }

  async getZoomAccessToken() {
    try {
      if (!this.zoomConfig.accountId || !this.zoomConfig.clientId || !this.zoomConfig.clientSecret) {
        throw new Error('Zoom credentials not configured');
      }

      const response = await axios.post('https://zoom.us/oauth/token', null, {
        params: {
          grant_type: 'account_credentials',
          account_id: this.zoomConfig.accountId
        },
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.zoomConfig.clientId}:${this.zoomConfig.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000 // 10 second timeout
      });
      
      return response.data.access_token;
    } catch (error) {
      console.error('Error getting Zoom access token:', error.response?.data || error.message);
      throw new Error('Failed to get Zoom access token: ' + (error.response?.data?.message || error.message));
    }
  }

  async createZoomMeeting(meetingData) {
    try {
      // Check if Zoom credentials are configured
      if (!this.zoomConfig.accountId || !this.zoomConfig.clientId || !this.zoomConfig.clientSecret) {
        console.warn('Zoom credentials not configured, generating instant Zoom link');
        return {
          success: false,
          error: 'Zoom credentials not configured. Please add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET to .env'
        };
      }

      const accessToken = await this.getZoomAccessToken();
      
      // Normalize start_time — datetime-local sends '2025-07-01T10:00', Zoom needs full ISO
      let rawStart = meetingData.start_time || new Date(Date.now() + 60000).toISOString();
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawStart)) rawStart += ':00';
      const startTime = new Date(rawStart).toISOString();
      
      const zoomMeetingData = {
        topic: meetingData.topic || 'Interview Meeting',
        type: 2,
        start_time: startTime,
        duration: parseInt(meetingData.duration) || 60,
        timezone: 'UTC',
        agenda: meetingData.description || 'Interview meeting',
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: true,
          mute_upon_entry: false,
          watermark: false,
          use_pmi: false,
          approval_type: 2,
          audio: 'both',
          auto_recording: 'none',
          waiting_room: false
        }
      };

      const response = await axios.post('https://api.zoom.us/v2/users/me/meetings', zoomMeetingData, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        meeting: {
          platform: 'zoom',
          meetingId: response.data.id,
          join_url: response.data.join_url,
          start_url: response.data.start_url,
          password: response.data.password,
          meetingData: response.data
        }
      };
    } catch (error) {
      console.error('Error creating Zoom meeting:', error.response?.data || error.message);
      
      return {
        success: false,
        error: 'Failed to create Zoom meeting: ' + (error.response?.data?.message || error.message)
      };
    }
  }

  async createGoogleMeet(meetingData) {
    try {
      let accessToken = meetingData.accessToken;
      let refreshToken = meetingData.refreshToken;

      // If no tokens passed, use the first available connected employer as service account
      if (!accessToken) {
        const [serviceAccount] = await sequelize.query(
          'SELECT "googleMeetAccessToken", "googleMeetRefreshToken" FROM users WHERE "googleMeetAccessToken" IS NOT NULL LIMIT 1',
          { type: sequelize.QueryTypes.SELECT }
        );
        if (serviceAccount) {
          accessToken = serviceAccount.googleMeetAccessToken;
          refreshToken = serviceAccount.googleMeetRefreshToken;
          console.log('✅ Using service account tokens for Google Meet');
        }
      }

      // If still no tokens, return a working fallback link (Jitsi) instead of failing.
      // Real meet.google.com links REQUIRE a connected Google account — a random
      // meet.google.com/xxx URL would be fake and unusable. Jitsi rooms work with no auth.
      if (!accessToken) {
        console.warn('No Google OAuth token available, generating working Jitsi fallback link');
        const roomCode = `ZyncJobs-${crypto.randomUUID().slice(0, 8)}`;
        const link = `https://meet.jit.si/${roomCode}`;
        return {
          success: true,
          fallback: true,
          meeting: {
            platform: 'googlemeet',
            meetingId: roomCode,
            meetLink: link,
            join_url: link
          },
          message: 'Google Calendar not connected. Using a working fallback video link. Connect Google Calendar to create real Google Meet links.'
        };
      }

      // Create OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
        this.googleMeetConfig.clientId,
        this.googleMeetConfig.clientSecret,
        this.googleMeetConfig.redirectUri
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Create calendar event with Google Meet
      // Normalize start_time to full ISO string (Google Calendar API requires it)
      let rawStart = meetingData.start_time || new Date(Date.now() + 60000).toISOString();
      // If it's a partial datetime-local string like '2025-07-01T10:00', append seconds
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawStart)) rawStart += ':00';
      const startTime = new Date(rawStart).toISOString();
      const endTime = new Date(new Date(startTime).getTime() + (meetingData.duration || 60) * 60000).toISOString();

      const event = {
        summary: meetingData.topic || 'Interview Meeting',
        description: meetingData.description || 'Interview scheduled via ZyncJobs',
        start: { dateTime: startTime, timeZone: 'UTC' },
        end: { dateTime: endTime, timeZone: 'UTC' },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        },
        attendees: meetingData.attendees || []
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1
      });

      const meetLink = response.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri;
      const meetingId = response.data.conferenceData?.conferenceId;

      return {
        success: true,
        meeting: {
          platform: 'googlemeet',
          meetingId: meetingId || response.data.id,
          meetLink: meetLink || response.data.hangoutLink,
          join_url: meetLink || response.data.hangoutLink,
          eventId: response.data.id,
          eventData: response.data
        }
      };
    } catch (error) {
      console.error('Error creating Google Meet:', error?.message || error);
      // Fall back to a working Jitsi link instead of failing — the interview must go ahead.
      // A random meet.google.com/xxx URL would be fake (not a real meeting), so use Jitsi.
      const roomCode = `ZyncJobs-${crypto.randomUUID().slice(0, 8)}`;
      const link = `https://meet.jit.si/${roomCode}`;
      return {
        success: true,
        fallback: true,
        meeting: {
          platform: 'googlemeet',
          meetingId: roomCode,
          meetLink: link,
          join_url: link
        },
        message: 'Google Meet creation failed, using a working fallback video link: ' + (error?.message || String(error))
      };
    }
  }

  getGoogleMeetAuthUrl(employerId) {
    console.log('🔧 Google Meet Config:', {
      clientId: this.googleMeetConfig.clientId?.substring(0, 20) + '...',
      clientSecret: this.googleMeetConfig.clientSecret ? '***' : 'MISSING',
      redirectUri: this.googleMeetConfig.redirectUri
    });

    if (!this.googleMeetConfig.clientId || !this.googleMeetConfig.clientSecret) {
      throw new Error('Google Meet credentials not configured in .env');
    }

    const oauth2Client = new google.auth.OAuth2(
      this.googleMeetConfig.clientId,
      this.googleMeetConfig.clientSecret,
      this.googleMeetConfig.redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: employerId,
      prompt: 'consent'
    });

    console.log('✅ Generated auth URL for employer:', employerId);
    return authUrl;
  }

  async getGoogleMeetTokens(code) {
    const oauth2Client = new google.auth.OAuth2(
      this.googleMeetConfig.clientId,
      this.googleMeetConfig.clientSecret,
      this.googleMeetConfig.redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  async createMeeting(meetingData) {
    try {
      if (meetingData.platform === 'zoom') {
        return await this.createZoomMeeting(meetingData);
      } else if (meetingData.platform === 'googlemeet') {
        return await this.createGoogleMeet(meetingData);
      } else {
        throw new Error('Unsupported meeting platform');
      }
    } catch (error) {
      console.error('Error in createMeeting:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create meeting'
      };
    }
  }
}

const meetingService = new MeetingService();

export const createZoomMeeting = (meetingData) => meetingService.createZoomMeeting(meetingData);
export const createGoogleMeet = (meetingData) => meetingService.createGoogleMeet(meetingData);
export const getGoogleMeetAuthUrl = (employerId) => meetingService.getGoogleMeetAuthUrl(employerId);
export const getGoogleMeetTokens = (code) => meetingService.getGoogleMeetTokens(code);
export default MeetingService;
export { meetingService };
