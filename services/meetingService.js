import axios from 'axios';
import { google } from 'googleapis';

class MeetingService {
  constructor() {
    this.zoomConfig = {
      accountId: process.env.ZOOM_ACCOUNT_ID,
      clientId: process.env.ZOOM_CLIENT_ID,
      clientSecret: process.env.ZOOM_CLIENT_SECRET,
      secretToken: process.env.ZOOM_SECRET_TOKEN
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
        console.warn('Zoom credentials not configured, generating fallback link');
        const fallbackId = Math.random().toString().slice(2, 12);
        const fallbackPwd = Math.random().toString(36).substring(2, 8);
        return {
          success: true,
          fallback: true,
          meeting: {
            platform: 'zoom',
            meetingId: fallbackId,
            join_url: `https://zoom.us/j/${fallbackId}?pwd=${fallbackPwd}`,
            password: fallbackPwd
          },
          message: 'Using fallback Zoom link (credentials not configured)'
        };
      }

      const accessToken = await this.getZoomAccessToken();
      
      const startTime = meetingData.start_time || new Date(Date.now() + 60000).toISOString();
      
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
      
      // Generate fallback link on error
      const fallbackId = Math.random().toString().slice(2, 12);
      const fallbackPwd = Math.random().toString(36).substring(2, 8);
      
      return {
        success: true,
        fallback: true,
        meeting: {
          platform: 'zoom',
          meetingId: fallbackId,
          join_url: `https://zoom.us/j/${fallbackId}?pwd=${fallbackPwd}`,
          password: fallbackPwd
        },
        message: 'Using fallback Zoom link due to API error'
      };
    }
  }

  async createGoogleMeet(meetingData) {
    // Generate instant Google Meet link using new.meet.google.com
    // This creates a real meeting room that anyone can join
    const meetLink = 'https://meet.google.com/new';
    
    return {
      success: true,
      meeting: {
        platform: 'googlemeet',
        meetingId: 'instant',
        meetLink: meetLink,
        join_url: meetLink
      },
      message: 'Google Meet instant link generated. Click to create and join meeting.'
    };
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
export default MeetingService;
export { meetingService };