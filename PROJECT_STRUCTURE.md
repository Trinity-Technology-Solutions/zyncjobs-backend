# Zyncjobs Backend - Project Structure

## 📁 Folder Organization

```
zyncjobs-backend/
├── config/              # Configuration files
│   ├── database.js      # Database connection setup
│   ├── passport.js      # Passport authentication strategies
│   └── postgresql.js    # PostgreSQL specific config
│
├── data/                # Static data & seed files
│   ├── adminSettings.json
│   ├── cities.json
│   ├── colleges.json
│   ├── companies.json
│   ├── industries.json
│   ├── job_titles.json
│   ├── locations.json
│   ├── sample_jobs.json
│   └── skills.json
│
├── middleware/          # Express middleware
│   ├── adminAuth.js     # Admin authorization
│   ├── auth.js          # JWT authentication
│   ├── roleAuth.js      # Role-based access control
│   ├── sanitize.js      # Input sanitization
│   └── settingsMiddleware.js
│
├── models/              # Database models (Sequelize)
│   ├── User.js
│   ├── Job.js
│   ├── Application.js
│   ├── Company.js
│   ├── Profile.js
│   ├── Resume.js
│   └── ... (25 models total)
│
├── routes/              # API route handlers
│   ├── auth.js          # Authentication routes
│   ├── jobs.js          # Job CRUD operations
│   ├── applications.js  # Application management
│   ├── users.js         # User management
│   ├── admin*.js        # Admin panel routes
│   └── ... (70+ routes)
│
├── scripts/             # Database & utility scripts
│   ├── createDatabase.js    # Initialize database
│   ├── syncModels.js        # Sync Sequelize models
│   ├── loadInitialData.js   # Seed initial data
│   ├── clearAllData.js      # Clear database
│   └── createAdmin.js       # Create admin user
│
├── services/            # Business logic layer
│   ├── aiService.js         # AI integrations
│   ├── emailService.js      # Email notifications
│   ├── jobAlertScheduler.js # Scheduled job alerts
│   ├── resumeParserService.js
│   └── ... (20+ services)
│
├── uploads/             # File upload storage
│   ├── photos/          # User profile photos
│   └── resumes/         # Resume files
│
├── utils/               # Helper functions
│   ├── jwt.js           # JWT token utilities
│   ├── errorHandler.js  # Error handling
│   ├── geocode.js       # Location services
│   └── ... (12 utilities)
│
├── logs/                # Application logs
│
├── public/              # Static assets
│   └── images/
│
├── .env                 # Environment variables (local)
├── .env.qa              # QA environment config
├── .env.production      # Production environment config
├── .gitignore           # Git ignore rules
├── ecosystem.config.js  # PM2 configuration
├── instrument.mjs       # Sentry monitoring
├── package.json         # Dependencies & scripts
├── README.md            # Project documentation
└── server.js            # Application entry point
```

## 🚀 Key Features by Folder

### `/routes` - API Endpoints
- **Authentication**: Login, register, OAuth, password reset
- **Jobs**: CRUD, search, filtering, recommendations
- **Applications**: Apply, track, status updates
- **Admin**: Analytics, user management, moderation
- **AI Features**: Resume parsing, job matching, scoring

### `/services` - Business Logic
- **AI Services**: Resume parsing, job recommendations
- **Schedulers**: Job alerts, notifications, GDPR retention
- **Email**: Transactional emails, notifications
- **Integrations**: Zoom meetings, OAuth providers

### `/models` - Database Schema
- User management (candidates, employers, admins)
- Job postings and applications
- Messaging and notifications
- Analytics and tracking
- GDPR compliance

### `/middleware` - Request Processing
- JWT authentication
- Role-based authorization
- Input sanitization
- Rate limiting

### `/scripts` - Database Management
- Database initialization
- Model synchronization
- Data seeding
- Admin user creation

## 📝 NPM Scripts

```bash
npm start          # Start production server
npm run dev        # Development with auto-reload
npm run db:create  # Create database
npm run db:sync    # Sync models to database
npm run db:seed    # Load initial data
npm run db:clear   # Clear all data
npm run db:admin   # Create admin user
```

## 🔒 Security Features

- JWT authentication with refresh tokens
- Bcrypt password hashing
- Helmet.js security headers
- Rate limiting
- Input sanitization
- CORS configuration
- Session management

## 🛠️ Tech Stack

- **Runtime**: Node.js (v16+)
- **Framework**: Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Authentication**: JWT, Passport.js
- **Real-time**: Socket.io
- **Monitoring**: Sentry
- **Email**: Nodemailer
- **File Upload**: Multer, Cloudinary
- **Caching**: Redis (optional)

## 📦 Environment Setup

1. Copy `.env.example` to `.env`
2. Configure database connection
3. Set JWT secret
4. Configure email service
5. Add API keys for AI services (optional)

## 🔄 Deployment

- **Development**: `npm run dev`
- **QA**: `npm run start:qa`
- **Production**: `npm run start:prod`
- **Process Manager**: PM2 (ecosystem.config.js)

---

**Last Updated**: January 2025
**Version**: 1.0.0
