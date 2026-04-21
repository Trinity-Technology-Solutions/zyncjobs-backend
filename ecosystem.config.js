module.exports = {
  apps: [{
    name: 'zyncjobs-backend',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
      // All other environment variables should be set in .env.production file
      // This file should NOT contain any secrets or credentials
    }
  }]
};