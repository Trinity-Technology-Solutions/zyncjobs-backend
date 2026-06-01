# AI Rejection Scoring Improvements

## Problem Fixed
The AI rejection system was showing the same percentage (75% skills, 80% experience) for all candidates because it wasn't properly comparing job-specific requirements with candidate profiles.

## Changes Made

### 1. Enhanced Scoring Logic (`routes/aiRejectionSettings.js`)

#### Skills Scoring
- **Before**: Always returned 75% or hardcoded values
- **After**: Compares candidate skills directly with job requirements
  - Calculates percentage based on matching skills vs required skills
  - Returns 0% if no candidate skills, 50% if no job skills specified
  - Uses fuzzy matching (includes, exact match)

#### Experience Scoring  
- **Before**: Simple mapping based on experience level only
- **After**: Considers both experience level and experience range
  - Parses experience requirements from job descriptions (e.g., "5+ years")
  - Gives bonus points for exceeding requirements
  - Applies graduated penalties for not meeting requirements
  - Weighted scoring: 60% skills, 40% experience

### 2. Improved AI Prompt
- More detailed job and candidate information
- Specific instructions for exact skill matching
- Returns additional data (matching/missing skills)
- Increased token limit for better analysis

### 3. Enhanced Application Endpoints

#### Updated `/api/applications/job/:jobId`
- Now calculates AI scores in real-time if not present
- Includes candidate profile data
- Returns detailed AI analysis with each application

#### New `/api/applications/job/:jobId/ai-scores`
- Dedicated endpoint for AI scoring
- Uses the improved `runAutoRejection` function
- Handles errors gracefully

#### New `/api/applications/job/:jobId/recalculate-scores`
- Allows recalculating scores for existing applications
- Updates database with new AI analysis
- Returns count of updated applications

### 4. Test Coverage
Created `test/testAIScoring.js` to verify scoring logic with sample data.

## API Usage

### Get Applications with AI Scores
```javascript
GET /api/applications/job/{jobId}
// Returns applications with aiAnalysis field containing:
{
  skillsScore: 0-100,
  experienceScore: 0-100, 
  overallScore: 0-100,
  reasons: [],
  feedback: ""
}
```

### Recalculate Scores
```javascript
POST /api/applications/job/{jobId}/recalculate-scores
// Recalculates AI scores for all applications for a job
```

## Expected Results
- Each candidate now shows different skill/experience percentages
- Scores accurately reflect job requirements vs candidate qualifications
- Better candidate ranking and filtering
- More meaningful AI rejection suggestions

## Example Scoring Results
For a Senior Software Developer role requiring JavaScript, React, Node.js, PostgreSQL, AWS (5+ years):

- **Candidate A** (JS, React, Node.js + 6 years): 60% skills, 88% experience = 71% overall
- **Candidate B** (Python, Django + 3 years): 0% skills, 36% experience = 14% overall  
- **Candidate C** (All required skills + 8 years): 100% skills, 94% experience = 98% overall

## Frontend Integration
The frontend should now receive different percentages for each candidate and can display them in the AI Rejection dashboard. The `aiAnalysis` field contains all the scoring details.