# Contributing to Zyncjobs Backend

## Development Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your credentials
3. Install dependencies: `npm install`
4. Create database: `npm run db:create`
5. Sync models: `npm run db:sync`
6. Load initial data: `npm run db:seed`
7. Start server: `npm start` or `npm run dev`

## Project Structure

```
├── config/          # Database and passport configuration
├── data/            # Static data files (JSON)
├── middleware/      # Express middleware (auth, validation)
├── models/          # Sequelize models
├── routes/          # API route handlers
├── scripts/         # Database and utility scripts
├── services/        # Business logic services
├── uploads/         # File uploads directory
├── utils/           # Helper functions and utilities
└── server.js        # Main application entry point
```

## Coding Standards

- Use ES6+ features
- Follow ESLint rules
- Use Prettier for formatting
- Write meaningful commit messages
- Add comments for complex logic

## API Routes Naming

- Use kebab-case for URLs: `/api/job-alerts`
- Use plural nouns: `/api/jobs`, `/api/users`
- Use HTTP methods correctly: GET, POST, PUT, DELETE

## Database Scripts

- `npm run db:create` - Create database
- `npm run db:sync` - Sync models with database
- `npm run db:seed` - Load initial data
- `npm run db:clear` - Clear all data (use with caution)

## Testing

Run tests with: `npm test` (to be implemented)

## Deployment

1. Set `NODE_ENV=production`
2. Update environment variables
3. Run database migrations
4. Start server with `npm start`
