import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATES = ['classic', 'modern', 'minimal', 'executive', 'compact', 'professional'];

const testResumeData = {
  template: 'classic', // Will be changed for each test
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
      id: '1',
      title: 'Senior Software Engineer',
      company: 'Tech Solutions Inc',
      location: 'Chennai, India',
      duration: 'Jan 2021 - Present',
      current: true,
      bullets: [
        'Led development of microservices architecture serving 1M+ users',
        'Improved application performance by 40% through optimization',
        'Mentored team of 5 junior developers'
      ]
    },
    {
      id: '2',
      title: 'Software Engineer',
      company: 'Digital Innovations',
      location: 'Remote',
      duration: 'Jun 2018 - Dec 2020',
      current: false,
      bullets: [
        'Developed RESTful APIs using Node.js and Express',
        'Built responsive web applications with React',
        'Implemented CI/CD pipelines reducing deployment time by 60%'
      ]
    }
  ],
  education: [
    {
      id: '1',
      degree: 'B.Tech in Computer Science',
      institution: 'Anna University',
      location: 'Chennai',
      duration: 'Graduated 2018',
      grade: '8.5 CGPA'
    }
  ],
  certifications: [
    {
      id: '1',
      name: 'AWS Certified Solutions Architect',
      issuer: 'Amazon',
      year: '2023'
    },
    {
      id: '2',
      name: 'MongoDB Certified Developer',
      issuer: 'MongoDB Inc',
      year: '2022'
    }
  ],
  awards: [
    {
      id: '1',
      title: 'Best Innovation Award',
      issuer: 'Tech Solutions Inc',
      year: '2022',
      description: 'Recognized for developing innovative microservices architecture'
    }
  ],
  jobDescription: ''
};

async function testPDFGeneration(template) {
  console.log(`\n📄 Testing PDF generation with template: ${template}`);
  
  try {
    const API_URL = 'http://localhost:5000/api/pdf/generate-resume';
    const testData = { ...testResumeData, template };
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeData: testData })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    const outputDir = path.join(__dirname, 'test_output', 'templates');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `Lavanya_D_Resume_${template}.pdf`);
    fs.writeFileSync(outputPath, Buffer.from(buffer));

    console.log(`✅ PDF generated successfully`);
    console.log(`   File: ${outputPath}`);
    console.log(`   Size: ${(buffer.byteLength / 1024).toFixed(2)} KB`);
    
    return { success: true, size: buffer.byteLength, path: outputPath };
  } catch (error) {
    console.error(`❌ PDF generation failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function testDOCXGeneration(template) {
  console.log(`\n📝 Testing DOCX generation with template: ${template}`);
  
  try {
    const API_URL = 'http://localhost:5000/api/pdf/generate-docx';
    const testData = { ...testResumeData, template };
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeData: testData })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    const outputDir = path.join(__dirname, 'test_output', 'templates');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `Lavanya_D_Resume_${template}.docx`);
    fs.writeFileSync(outputPath, Buffer.from(buffer));

    console.log(`✅ DOCX generated successfully`);
    console.log(`   File: ${outputPath}`);
    console.log(`   Size: ${(buffer.byteLength / 1024).toFixed(2)} KB`);
    
    return { success: true, size: buffer.byteLength, path: outputPath };
  } catch (error) {
    console.error(`❌ DOCX generation failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('🧪 Starting Template Generation Tests\n');
  console.log('=' .repeat(60));
  
  const results = {
    pdf: {},
    docx: {}
  };

  // Test PDF generation for all templates
  console.log('\n📄 PDF GENERATION TESTS');
  console.log('=' .repeat(60));
  
  for (const template of TEMPLATES) {
    results.pdf[template] = await testPDFGeneration(template);
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between requests
  }

  // Test DOCX generation for all templates
  console.log('\n\n📝 DOCX GENERATION TESTS');
  console.log('=' .repeat(60));
  
  for (const template of TEMPLATES) {
    results.docx[template] = await testDOCXGeneration(template);
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between requests
  }

  // Summary
  console.log('\n\n📊 TEST SUMMARY');
  console.log('=' .repeat(60));
  
  const pdfSuccess = Object.values(results.pdf).filter(r => r.success).length;
  const docxSuccess = Object.values(results.docx).filter(r => r.success).length;
  
  console.log(`\nPDF Generation:`);
  console.log(`  ✅ Success: ${pdfSuccess}/${TEMPLATES.length}`);
  console.log(`  ❌ Failed:  ${TEMPLATES.length - pdfSuccess}/${TEMPLATES.length}`);
  
  console.log(`\nDOCX Generation:`);
  console.log(`  ✅ Success: ${docxSuccess}/${TEMPLATES.length}`);
  console.log(`  ❌ Failed:  ${TEMPLATES.length - docxSuccess}/${TEMPLATES.length}`);

  // Detailed results
  console.log('\n\n📋 DETAILED RESULTS');
  console.log('=' .repeat(60));
  
  console.log('\nPDF Files:');
  TEMPLATES.forEach(template => {
    const result = results.pdf[template];
    if (result.success) {
      console.log(`  ✅ ${template.padEnd(15)} - ${(result.size / 1024).toFixed(2)} KB`);
    } else {
      console.log(`  ❌ ${template.padEnd(15)} - ${result.error}`);
    }
  });

  console.log('\nDOCX Files:');
  TEMPLATES.forEach(template => {
    const result = results.docx[template];
    if (result.success) {
      console.log(`  ✅ ${template.padEnd(15)} - ${(result.size / 1024).toFixed(2)} KB`);
    } else {
      console.log(`  ❌ ${template.padEnd(15)} - ${result.error}`);
    }
  });

  // Output directory info
  const outputDir = path.join(__dirname, 'test_output', 'templates');
  console.log('\n\n📁 OUTPUT DIRECTORY');
  console.log('=' .repeat(60));
  console.log(`Location: ${outputDir}`);
  
  if (fs.existsSync(outputDir)) {
    const files = fs.readdirSync(outputDir);
    console.log(`Files generated: ${files.length}`);
    console.log('\nGenerated files:');
    files.forEach(file => {
      const filePath = path.join(outputDir, file);
      const stats = fs.statSync(filePath);
      console.log(`  - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
    });
  }

  // Final status
  console.log('\n\n' + '=' .repeat(60));
  const allSuccess = pdfSuccess === TEMPLATES.length && docxSuccess === TEMPLATES.length;
  if (allSuccess) {
    console.log('🎉 ALL TESTS PASSED!');
  } else {
    console.log('⚠️  SOME TESTS FAILED - Check details above');
  }
  console.log('=' .repeat(60) + '\n');

  // Exit with appropriate code
  process.exit(allSuccess ? 0 : 1);
}

// Run tests
console.log('🚀 Template Generation Test Suite');
console.log('Testing all 6 resume templates\n');
console.log('Templates to test:', TEMPLATES.join(', '));
console.log('\nMake sure backend server is running on http://localhost:5000\n');

runAllTests().catch(err => {
  console.error('\n💥 Test suite crashed:', err);
  process.exit(1);
});
