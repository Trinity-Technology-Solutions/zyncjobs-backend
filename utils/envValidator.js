const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'SMTP_EMAIL',
  'SMTP_PASSWORD'
];

const optionalEnvVars = [
  'FRONTEND_URL'
];

const sensitiveEnvVars = [
  'OPENROUTER_API_KEY',
  'REDIS_URL'
];

const validateFormat = {
  DATABASE_URL: (val) => val.startsWith('postgresql'),
  SMTP_EMAIL: (val) => val.includes('@'),
  JWT_SECRET: (val) => val.length >= 32
};

export const validateEnv = () => {
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing);
    process.exit(1);
  }

  // Format validation - only validate if the env var exists
  for (const [key, validator] of Object.entries(validateFormat)) {
    if (process.env[key] && !validator(process.env[key])) {
      console.error(`Invalid format for ${key}`);
      process.exit(1);
    }
  }

  // Set default for FRONTEND_URL if not provided
  if (!process.env.FRONTEND_URL) {
    process.env.FRONTEND_URL = 'https://trinity-jobs.vercel.app';
    console.log('✓ Using default FRONTEND_URL:', process.env.FRONTEND_URL);
  }

  console.log('✓ Environment variables validated');
};