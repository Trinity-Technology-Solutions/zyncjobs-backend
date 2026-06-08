module.exports = {
  apps: [{
    name: 'zyncjobs-backend',
    script: 'node',
    args: '--import ./instrument.mjs server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_qa: {
      NODE_ENV: 'qa',
      PORT: 5001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000,
      FRONTEND_URL: 'https://www.zyncjobs.com'
    }
  }]
};