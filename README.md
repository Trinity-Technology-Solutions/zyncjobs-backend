# Zyncjobs Backend API

Node.js backend API for Zyncjobs job portal with PostgreSQL database.

## Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (local installation)
- npm or yarn

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the root directory:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=zyncjobs
   DB_USER=postgres
   DB_PASSWORD=your_password
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/zyncjobs
   PORT=5000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:5173
   ```

3. **Create database:**
   ```bash
   npm run create:db
   ```

4. **Start server:**
   ```bash
   npm start
   ```

Server will run on `http://localhost:5000`

## API Endpoints

- `GET /api/test` - Test PostgreSQL connection
- `GET /api/jobs` - Get all jobs
- `POST /api/jobs` - Create new job
- `GET /api/jobs/:id` - Get specific job
- `GET /api/search?q=<query>&location=<location>` - Search jobs
- `POST /api/users` - Create new user
- `GET /api/users/:id` - Get specific user

## Database Tables

- `jobs` - Job listings
- `users` - User profiles
- `applications` - Job applications
- `analytics` - User analytics

## Scripts

- `npm start` - Start server
- `npm run dev` - Start with nodemon
- `npm run create:db` - Create database
