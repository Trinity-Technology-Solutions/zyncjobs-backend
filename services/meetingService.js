import axios from 'axios';
import { google } from 'googleapis';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

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
      redirectUri: process.env.GOOGLE_MEET_REDIRECT_URI || `${(process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '')}/api/meetings/google-meet/callback`
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

  // PRODUCTION PATH: Service Account with domain-wide delegation.
  // Once the Workspace admin grants Calendar scopes to the service account's client ID,
  // the backend can create real Google Meet events on behalf of any company account —
  // no per-user OAuth, no consent screens, no "unverified app" warnings.
  getServiceAccountAuth(impersonateEmail) {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/meetings.space.created'
    ];
    const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
    const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    if (keyFile) {
      return new google.auth.JWT({
        keyFile,
        scopes,
        subject: impersonateEmail
      });
    }
    if (saEmail && privateKeyB64) {
      const privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8').replace(/\\n/g, '\n');
      return new google.auth.JWT({
        email: saEmail,
        key: privateKey,
        scopes,
        subject: impersonateEmail
      });
    }
    return null;
  }

  isServiceAccountConfigured() {
    const hasCredentials = !!(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
      || (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY));
    return hasCredentials && !!process.env.GOOGLE_WORKSPACE_DOMAIN;
  }

  // The actual employer must own the space. Never create an interview as a shared
  // service account, because that would make the shared account the host.
  resolveImpersonateEmail(employerEmail) {
    const domain = process.env.GOOGLE_WORKSPACE_DOMAIN;
    if (employerEmail && domain && employerEmail.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
      return employerEmail;
    }
    return null;
  }

  async createRestrictedMeetSpace(auth) {
    const response = await auth.request({
      url: 'https://meet.googleapis.com/v2/spaces',
      method: 'POST',
      data: {
        config: {
          // The employer who authenticated/was impersonated owns the space.
          // Anyone who is not an invited user must knock for the host to admit them.
          accessType: 'RESTRICTED',
          moderation: 'ON'
        }
      }
    });
    const meetingUri = response.data?.meetingUri;
    if (!meetingUri || !/^https:\/\/meet\.google\.com\//i.test(meetingUri)) {
      throw new Error('Google Meet did not return a valid restricted meeting link.');
    }
    return response.data;
  }

  createGoogleMeet(meetingData) {
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
      // No candidate is added as a Calendar attendee. Their emailed link is an
      // uninvited participant link and the restricted Meet space requires admission.
    };

    return this.createMeetEvent(event, meetingData);
  }

  async createMeetEvent(event, meetingData) {
    try {
      const impersonateEmail = this.resolveImpersonateEmail(meetingData.employerEmail);
      const saAuth = impersonateEmail ? this.getServiceAccountAuth(impersonateEmail) : null;
      if (saAuth) {
        console.log('Creating restricted Google Meet space for employer:', impersonateEmail);
        const space = await this.createRestrictedMeetSpace(saAuth);
        const calendar = google.calendar({ version: 'v3', auth: saAuth });
        const calendarEvent = await calendar.events.insert({
          calendarId: 'primary',
          resource: { ...event, location: space.meetingUri },
          sendUpdates: 'none'
        });
        return {
          success: true,
          meeting: {
            platform: 'googlemeet',
            meetingId: space.meetingCode || space.name,
            meetLink: space.meetingUri,
            join_url: space.meetingUri,
            host_url: space.meetingUri,
            eventId: calendarEvent.data.id,
            eventData: calendarEvent.data,
            accessType: space.config?.accessType,
            moderation: space.config?.moderation
          }
        };
      }

      // --- LEGACY PATH: per-employer OAuth token ---
      let accessToken = meetingData.accessToken;
      let refreshToken = meetingData.refreshToken;

      // If no tokens passed, use the requesting employer's connected Google account
      if (!accessToken && meetingData.employerId) {
        let [account] = await sequelize.query(
          `SELECT id, "googleMeetAccessToken", "googleMeetRefreshToken" FROM users
           WHERE id::text = $1 AND "googleMeetAccessToken" IS NOT NULL LIMIT 1`,
          { bind: [meetingData.employerId], type: QueryTypes.SELECT }
        );
        if (!account) {
          [account] = await sequelize.query(
            `SELECT id, "googleMeetAccessToken", "googleMeetRefreshToken" FROM users
             WHERE ("employerId" = $1 OR LOWER(email) = LOWER($1)) AND "googleMeetAccessToken" IS NOT NULL LIMIT 1`,
            { bind: [meetingData.employerId], type: QueryTypes.SELECT }
          );
        }
        if (account) {
          accessToken = account.googleMeetAccessToken;
          refreshToken = account.googleMeetRefreshToken;
          console.log('✅ Using employer Google Meet tokens for user:', account.id);
        }
      }

      if (!accessToken) {
        console.warn('No Google OAuth token available for employer:', meetingData.employerId);
        return {
          success: false,
          needsConnect: true,
          error: 'No Google account connected. Connect your Google account to generate a real Google Meet link.'
        };
      }

      const oauth2Client = new google.auth.OAuth2(
        this.googleMeetConfig.clientId,
        this.googleMeetConfig.clientSecret,
        this.googleMeetConfig.redirectUri
      );
      oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

      const space = await this.createRestrictedMeetSpace(oauth2Client);

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const calendarEvent = await calendar.events.insert({
        calendarId: 'primary',
        resource: { ...event, location: space.meetingUri },
        sendUpdates: 'none'
      });

      return {
        success: true,
        meeting: {
          platform: 'googlemeet',
          meetingId: space.meetingCode || space.name,
          meetLink: space.meetingUri,
          join_url: space.meetingUri,
          host_url: space.meetingUri,
          eventId: calendarEvent.data.id,
          eventData: calendarEvent.data,
          accessType: space.config?.accessType,
          moderation: space.config?.moderation
        }
      };
    } catch (error) {
      console.error('Error creating Google Meet:', error?.message || error);
      const needsConnect = /unauthor|invalid_grant|invalid token|token.*expired|auth|domain.*delegat|insufficient/i.test(error?.message || String(error));
      return {
        success: false,
        ...(needsConnect ? { needsConnect: true } : {}),
        error: 'Failed to create Google Meet: ' + (error?.message || String(error))
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
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/meetings.space.created'
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
export const isServiceAccountConfigured = () => meetingService.isServiceAccountConfigured();
export default MeetingService;
export { meetingService };
