/**
 * Test script for Dice-like ID System
 * Demonstrates Employer ID and Position ID functionality
 */

import express from 'express';
import { generateEmployerId, generatePositionId } from '../utils/idGenerator.js';
import User from '../models/User.js';
import Job from '../models/Job.js';

const router = express.Router();

// Test endpoint to demonstrate ID generation
router.get('/test-ids', async (req, res) => {
  try {
    // Generate sample IDs
    const employerId1 = generateEmployerId();
    const employerId2 = generateEmployerId();
    
    const positionId1 = generatePositionId();
    const positionId2 = generatePositionId();
    const positionId3 = generatePositionId();

    res.json({
      message: 'Dice-like ID System Demo',
      examples: {
        employerIds: [employerId1, employerId2],
        positionIds: [positionId1, positionId2, positionId3],
        explanation: {
          employerId: 'Unique 8-digit identifier for each company/recruiter (like Dice ID)',
          positionId: 'Unique identifier for each job posting (format: YYYY-NNNN)'
        },
        usage: {
          sameEmployer: {
            employerId: employerId1,
            jobs: [
              { positionId: positionId1, title: 'React Developer' },
              { positionId: positionId2, title: 'Node.js Developer' },
              { positionId: positionId3, title: 'Full Stack Developer' }
            ],
            note: 'Same employer ID, different position IDs for each job'
          }
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to create sample data
router.post('/create-sample-data', async (req, res) => {
  try {
    // Create sample employer
    const employerId = generateEmployerId();
    
    const employer = await User.create({
      email: `employer${employerId}@example.com`,
      password: 'hashedpassword',
      name: 'Tech Solutions Inc',
      role: 'employer',
      company: 'Tech Solutions Inc',
      companyName: 'Tech Solutions Inc',
      employerId: employerId
    });

    // Create sample jobs for this employer
    const jobs = await Promise.all([
      Job.create({
        jobTitle: 'Senior React Developer',
        company: 'Tech Solutions Inc',
        location: 'San Francisco, CA',
        jobType: 'Full-time',
        workSetting: 'Remote',
        description: 'We are looking for a Senior React Developer...',
        requirements: 'React, JavaScript, TypeScript',
        skills: ['React', 'JavaScript', 'TypeScript', 'Node.js'],
        salaryMin: 120000,
        salaryMax: 150000,
        currency: 'USD',
        experienceLevel: 'Senior',
        employerEmail: employer.email,
        employerId: employerId,
        positionId: generatePositionId()
      }),
      Job.create({
        jobTitle: 'Backend Node.js Developer',
        company: 'Tech Solutions Inc',
        location: 'San Francisco, CA',
        jobType: 'Full-time',
        workSetting: 'Hybrid',
        description: 'Join our backend team as a Node.js Developer...',
        requirements: 'Node.js, Express, MongoDB',
        skills: ['Node.js', 'Express', 'MongoDB', 'REST APIs'],
        salaryMin: 100000,
        salaryMax: 130000,
        currency: 'USD',
        experienceLevel: 'Mid',
        employerEmail: employer.email,
        employerId: employerId,
        positionId: generatePositionId()
      }),
      Job.create({
        jobTitle: 'DevOps Engineer',
        company: 'Tech Solutions Inc',
        location: 'San Francisco, CA',
        jobType: 'Full-time',
        workSetting: 'On-site',
        description: 'We need a DevOps Engineer to manage our infrastructure...',
        requirements: 'AWS, Docker, Kubernetes',
        skills: ['AWS', 'Docker', 'Kubernetes', 'CI/CD'],
        salaryMin: 110000,
        salaryMax: 140000,
        currency: 'USD',
        experienceLevel: 'Senior',
        employerEmail: employer.email,
        employerId: employerId,
        positionId: generatePositionId()
      })
    ]);

    res.json({
      message: 'Sample data created successfully!',
      employer: {
        id: employer.id,
        name: employer.name,
        email: employer.email,
        employerId: employer.employerId
      },
      jobs: jobs.map(job => ({
        id: job.id,
        title: job.jobTitle,
        employerId: job.employerId,
        positionId: job.positionId
      })),
      apiExamples: {
        getEmployerJobs: `/api/employers/${employerId}/jobs`,
        getJobByPosition: `/api/jobs/position/${jobs[0].positionId}`,
        getEmployerInfo: `/api/employers/${employerId}`
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test search by IDs
router.get('/search-demo/:employerId', async (req, res) => {
  try {
    const { employerId } = req.params;
    
    // Get employer info
    const employer = await User.findOne({
      where: { employerId, role: 'employer' },
      attributes: ['name', 'email', 'company', 'employerId']
    });

    if (!employer) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    // Get all jobs by this employer
    const jobs = await Job.findAll({
      where: { employerId },
      attributes: ['id', 'jobTitle', 'positionId', 'location', 'jobType', 'createdAt']
    });

    res.json({
      employer: employer,
      jobCount: jobs.length,
      jobs: jobs,
      diceComparison: {
        diceId: employerId,
        positionIds: jobs.map(job => job.positionId),
        explanation: 'Similar to Dice.com - one employer ID, multiple position IDs'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;