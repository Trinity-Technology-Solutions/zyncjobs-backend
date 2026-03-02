import cron from 'node-cron';
import fetch from 'node-fetch';

// Run job alerts check every hour
cron.schedule('0 * * * *', async () => {
  console.log('🔔 Running job alerts check...');
  
  try {
    const response = await fetch('http://localhost:5000/api/job-alerts/check-and-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Job alerts processed:', result.message);
    } else {
      console.error('❌ Job alerts check failed:', response.statusText);
    }
  } catch (error) {
    console.error('❌ Job alerts error:', error.message);
  }
});

// Run daily job alerts at 9 AM
cron.schedule('0 9 * * *', async () => {
  console.log('📧 Sending daily job alerts...');
  
  try {
    const response = await fetch('http://localhost:5000/api/job-alerts/check-and-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Daily job alerts sent:', result.message);
    }
  } catch (error) {
    console.error('❌ Daily job alerts error:', error.message);
  }
});

console.log('🚀 Job alerts cron jobs started');
console.log('⏰ Hourly check: Every hour');
console.log('📅 Daily alerts: 9:00 AM every day');