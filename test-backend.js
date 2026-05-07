import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

console.log('🧪 ZyncJobs Backend Test Suite');
console.log('================================');
console.log(`Testing: ${API_URL}`);
console.log('');

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, success, message = '') {
  const status = success ? '✅ PASS' : '❌ FAIL';
  const output = `${status} ${name}${message ? ` - ${message}` : ''}`;
  console.log(output);
  
  results.tests.push({ name, success, message });
  if (success) results.passed++;
  else results.failed++;
}

async function testEndpoint(name, url, options = {}) {
  try {
    const response = await fetch(url, {
      timeout: 10000,
      ...options
    });
    
    const isSuccess = response.ok;
    const statusText = `${response.status} ${response.statusText}`;
    
    logTest(name, isSuccess, statusText);
    
    if (response.headers.get('content-type')?.includes('application/json')) {
      const data = await response.json();
      if (!isSuccess) {
        console.log(`   Error: ${data.error || data.message || 'Unknown error'}`);
      }
      return { success: isSuccess, data, status: response.status };
    }
    
    return { success: isSuccess, status: response.status };
  } catch (error) {
    logTest(name, false, error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🔍 Basic Connectivity Tests');
  console.log('----------------------------');
  
  // Test basic endpoints
  await testEndpoint('Health Check', `${API_URL}/health`);
  await testEndpoint('Ping', `${API_URL}/ping`);
  await testEndpoint('Root Endpoint', BASE_URL);
  
  console.log('');
  console.log('🔐 Authentication Tests');
  console.log('------------------------');
  
  // Test auth endpoints (should return 401/400 without credentials)
  const authResult = await testEndpoint('Admin Analytics (No Auth)', `${API_URL}/admin/analytics/overview`);
  if (authResult.status === 401) {
    logTest('Admin Auth Protection', true, 'Correctly requires authentication');
  } else {
    logTest('Admin Auth Protection', false, 'Should require authentication');
  }
  
  console.log('');
  console.log('📊 Database Tests');
  console.log('------------------');
  
  // Test database-dependent endpoints
  await testEndpoint('Admin Analytics Health', `${API_URL}/admin/analytics/health`);
  
  console.log('');
  console.log('🔧 API Structure Tests');
  console.log('-----------------------');
  
  // Test various API endpoints
  await testEndpoint('Jobs Endpoint', `${API_URL}/jobs`);
  await testEndpoint('Users Endpoint', `${API_URL}/users`);
  await testEndpoint('Applications Test', `${API_URL}/applications/test`);
  
  console.log('');
  console.log('📈 Results Summary');
  console.log('==================');
  console.log(`Total Tests: ${results.passed + results.failed}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);
  
  if (results.failed > 0) {
    console.log('');
    console.log('❌ Failed Tests:');
    results.tests
      .filter(t => !t.success)
      .forEach(t => console.log(`   - ${t.name}: ${t.message}`));
  }
  
  console.log('');
  
  if (results.failed === 0) {
    console.log('🎉 All tests passed! Backend is healthy.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the backend configuration.');
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Tests interrupted by user');
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run the tests
runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error.message);
  process.exit(1);
});