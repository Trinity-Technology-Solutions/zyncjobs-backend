import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testResumeData = {
  resumeData: {
    personalInfo: {
      name: 'Lavanya D',
      email: 'lavanya@example.com',
      phone: '+91 9876543210',
      location: 'Chennai, India',
      linkedin: 'linkedin.com/in/lavanyadev',
      portfolio: 'lavanya.dev'
    },
    summary: 'Experienced software developer with 5+ years in full-stack development. Specialized in React, Node.js, and cloud technologies.',
    skills: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'PostgreSQL', 'AWS', 'Docker', 'Git'],
    experience: [
      {
        title: 'Senior Software Engineer',
        company: 'Tech Solutions Inc',
        duration: 'Jan 2021 - Present',
        bullets: [
          'Led development of microservices architecture serving 1M+ users',
          'Improved application performance by 40% through optimization',
          'Mentored team of 5 junior developers'
        ]
      },
      {
        title: 'Software Engineer',
        company: 'Digital Innovations',
        duration: 'Jun 2018 - Dec 2020',
        bullets: [
          'Developed RESTful APIs using Node.js and Express',
          'Built responsive web applications with React',
          'Implemented CI/CD pipelines reducing deployment time by 60%'
        ]
      }
    ],
    education: [
      {
        degree: 'B.Tech in Computer Science',
        institution: 'Anna University',
        duration: 'Graduated 2018',
        grade: '8.5 CGPA'
      }
    ],
    certifications: [
      {
        name: 'AWS Certified Solutions Architect',
        validity: 'Jan 2023 - No Expiry'
      },
      {
        name: 'MongoDB Certified Developer',
        validity: 'Mar 2022 - Mar 2025'
      }
    ]
  }
};

async function testDOCXGeneration() {
  console.log('🧪 Testing DOCX Generation...\n');

  try {
    const API_URL = 'http://localhost:5000/api/pdf/generate-docx';
    
    console.log('📤 Sending request to:', API_URL);
    console.log('📋 Resume data:', JSON.stringify(testResumeData, null, 2).substring(0, 200) + '...\n');

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testResumeData)
    });

    console.log('📥 Response status:', response.status, response.statusText);
    console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error response:', errorText);
      process.exit(1);
    }

    const buffer = await response.arrayBuffer();
    const outputPath = path.join(__dirname, 'test_output', 'Lavanya_D_Resume.docx');
    
    // Create output directory if it doesn't exist
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, Buffer.from(buffer));

    console.log('\n✅ DOCX generated successfully!');
    console.log('📁 File saved to:', outputPath);
    console.log('📊 File size:', (buffer.byteLength / 1024).toFixed(2), 'KB');
    console.log('\n💡 Open the file in Microsoft Word or Google Docs to verify formatting.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run test
testDOCXGeneration();
