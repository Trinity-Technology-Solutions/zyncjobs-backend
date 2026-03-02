# Zyncjobs Backend API

Node.js backend API for Zyncjobs job portal with PostgreSQL database.

## Features

- 🔐 JWT Authentication & Authorization
- 👥 User Management (Candidates & Employers)
- 💼 Job Posting & Application System
- 🤖 AI-Powered Resume Parsing
- 📊 Analytics & Tracking
- 📧 Email Notifications
- 💬 Real-time Messaging (Socket.io)
- 🔍 Advanced Search & Filtering
- 📄 Resume Management
- 🎯 Job Alerts

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Quick Start

1. **Clone and Install:**
   ```bash
   git clone <repository-url>
   cd zyncjobs-backend
   npm install
   ```

2. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Setup Database:**
   ```bash
   npm run db:create
   npm run db:sync
   npm run db:seed
   ```

4. **Start Server:**
   ```bash
   npm start          # Production
   npm run dev        # Development with nodemon
   ```

## Environment Variables

See `.env.example` for all required environment variables.

### Required:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `SMTP_EMAIL` & `SMTP_PASSWORD` - Email configuration

### Optional:
- AI service keys (OpenRouter, Anthropic, OpenAI)
- OAuth credentials (Google)
- Meeting service keys (Zoom)

## API Documentation

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token

### Jobs
- `GET /api/jobs` - Get all jobs
- `POST /api/jobs` - Create job (employer only)
- `GET /api/jobs/:id` - Get job details
- `PUT /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job

### Applications
- `POST /api/applications` - Apply for job
- `GET /api/applications` - Get user applications
- `PUT /api/applications/:id` - Update application status

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update user profile

### Search
- `GET /api/search?q=<query>&location=<location>` - Search jobs

For complete API documentation, see [API.md](./docs/API.md)

## Project Structure

```
├── config/          # Configuration files
├── data/            # Static data (JSON)
├── middleware/      # Express middleware
├── models/          # Database models
├── routes/          # API routes
├── scripts/         # Utility scripts
├── services/        # Business logic
├── uploads/         # File uploads
├── utils/           # Helper functions
└── server.js        # Entry point
```

## Database Scripts

```bash
npm run db:create   # Create database
npm run db:sync     # Sync models
npm run db:seed     # Load initial data
npm run db:clear    # Clear all data
```

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## Security

- Passwords hashed with bcrypt
- JWT tokens for authentication
- Rate limiting enabled
- Helmet.js for security headers
- Input validation with express-validator

## License

ISC

## Support

For issues and questions, please open an issue on GitHub.
