@echo off
echo 🚀 Starting ZyncJobs Backend...

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

REM Check environment variables
if "%JWT_SECRET%"=="" (
    echo ⚠️  JWT_SECRET not set, using default from .env
)

if "%DB_PASSWORD%"=="" (
    echo ⚠️  DB_PASSWORD not set, using default from .env
)

echo 🔧 Loading environment variables...
if exist ".env" (
    echo ✅ Found .env file
) else (
    echo ❌ .env file not found! Please create it first.
    pause
    exit /b 1
)

echo 🌟 Starting development server...
npm run dev

pause