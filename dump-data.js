import fs from 'fs';
import Application from './models/Application.js';
import Job from './models/Job.js';
import Interview from './models/Interview.js';
import './config/database.js';

const dumpData = async () => {
    try {
        const apps = await Application.findAll({ raw: true });
        const jobs = await Job.findAll({ raw: true });
        const ints = await Interview.findAll({ raw: true });

        let output = '--- JOBS ---\n';
        jobs.forEach(j => {
            output += `ID: ${j.id} | PID: ${j.positionId} | Title: ${j.jobTitle || j.title}\n`;
        });

        output += '\n--- APPLICATIONS ---\n';
        apps.forEach(a => {
            output += `ID: ${a.id} | JobID: ${a.jobId} | Candidate: ${a.candidateName}\n`;
        });

        output += '\n--- INTERVIEWS ---\n';
        ints.forEach(i => {
            output += `ID: ${i.id} | JobID: ${i.jobId} | Candidate: ${i.candidateName} | Status: ${i.status}\n`;
        });

        fs.writeFileSync('clean_dump.txt', output);
        console.log('Dump completed: clean_dump.txt');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

dumpData();
