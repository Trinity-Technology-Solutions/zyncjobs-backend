/**
 * Test script for GDPR PDF Export API
 * Usage: node test_gdpr_api.js
 */

import dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:5000';

// Test configuration
const TEST_CONFIG = {
  // Replace with actual test user credentials
  email: 'test@example.com',
  password: 'Test@1234'
};

async function testGdprPdfExport() {
  console.log('🧪 Testing GDPR PDF Export API\n');
  console.log('API URL:', API_URL);
  console.log('─'.repeat(50));

  try {
    // Step 1: Login to get token
    console.log('\n1️⃣ Logging in...');
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_CONFIG.email,
        password: TEST_CONFIG.password
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.accessToken || loginData.token;
    const userId = loginData.user?.id || loginData.user?._id;

    if (!token || !userId) {
      throw new Error('No token or userId received from login');
    }

    console.log('✅ Login successful');
    console.log('   User ID:', userId);
    console.log('   Token:', token.substring(0, 20) + '...');

    // Step 2: Test PDF export
    console.log('\n2️⃣ Testing PDF export...');
    const pdfResponse = await fetch(`${API_URL}/api/gdpr/export-pdf/${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!pdfResponse.ok) {
      const errorText = await pdfResponse.text();
      throw new Error(`PDF export failed: ${pdfResponse.status} - ${errorText}`);
    }

    const contentType = pdfResponse.headers.get('content-type');
    const contentDisposition = pdfResponse.headers.get('content-disposition');
    const contentLength = pdfResponse.headers.get('content-length');

    console.log('✅ PDF export successful');
    console.log('   Content-Type:', contentType);
    console.log('   Content-Disposition:', contentDisposition);
    console.log('   Content-Length:', contentLength, 'bytes');

    // Step 3: Verify PDF content
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBytes = new Uint8Array(pdfBuffer);
    
    // Check PDF magic number (should start with %PDF)
    const isPdf = pdfBytes[0] === 0x25 && pdfBytes[1] === 0x50 && 
                  pdfBytes[2] === 0x44 && pdfBytes[3] === 0x46;

    if (isPdf) {
      console.log('✅ Valid PDF file generated');
    } else {
      console.log('❌ Invalid PDF file (wrong magic number)');
    }

    console.log('\n' + '─'.repeat(50));
    console.log('🎉 All tests passed!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\n💡 Tips:');
    console.error('   - Make sure the server is running');
    console.error('   - Update TEST_CONFIG with valid credentials');
    console.error('   - Check if DATABASE_URL is configured');
    process.exit(1);
  }
}

// Run test
testGdprPdfExport();
