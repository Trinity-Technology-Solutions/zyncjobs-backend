#!/usr/bin/env node

/**
 * Test script for account deletion functionality
 * Run: node test_account_deletion.js
 */

import fetch from 'node-fetch';

const API_BASE = process.env.API_URL || 'http://localhost:5000/api';

// Test configuration
const TEST_CONFIG = {
  // Use a test user ID - replace with actual test user
  testUserId: 'test-user-123',
  testEmail: 'test@example.com',
  // Get from your auth system
  testToken: 'your-test-jwt-token-here'
};

async function testAccountDeletion() {
  console.log('🧪 Testing Account Deletion Functionality\n');
  
  try {
    // Test 1: Data Export
    console.log('📥 Testing Data Export...');
    const exportResponse = await fetch(`${API_BASE}/gdpr/download-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_CONFIG.testToken}`
      },
      body: JSON.stringify({
        userId: TEST_CONFIG.testUserId
      })
    });
    
    if (exportResponse.ok) {
      const exportData = await exportResponse.json();
      console.log('✅ Data export successful');
      console.log('📊 Export contains:', Object.keys(exportData.data || {}));
    } else {
      console.log('❌ Data export failed:', exportResponse.status);
      const error = await exportResponse.text();
      console.log('Error:', error);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 2: Account Deletion (WARNING: This will actually delete the account!)
    console.log('🗑️  Testing Account Deletion...');
    console.log('⚠️  WARNING: This will permanently delete the test account!');
    
    // Uncomment the following lines to actually test deletion
    /*
    const deleteResponse = await fetch(`${API_BASE}/gdpr/delete-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_CONFIG.testToken}`
      },
      body: JSON.stringify({
        userId: TEST_CONFIG.testUserId,
        confirmDeletion: true,
        reason: 'Testing account deletion functionality'
      })
    });
    
    if (deleteResponse.ok) {
      const deleteData = await deleteResponse.json();
      console.log('✅ Account deletion successful');
      console.log('📝 Response:', deleteData.message);
    } else {
      console.log('❌ Account deletion failed:', deleteResponse.status);
      const error = await deleteResponse.text();
      console.log('Error:', error);
    }
    */
    
    console.log('🔒 Account deletion test skipped (uncomment to run)');
    
  } catch (error) {
    console.error('💥 Test failed with error:', error.message);
  }
}

async function testEndpointAvailability() {
  console.log('🔍 Testing Endpoint Availability\n');
  
  const endpoints = [
    { name: 'GDPR Download Data (POST)', url: `${API_BASE}/gdpr/download-data`, method: 'POST' },
    { name: 'GDPR Delete Account (POST)', url: `${API_BASE}/gdpr/delete-account`, method: 'POST' },
    { name: 'GDPR Privacy Settings (GET)', url: `${API_BASE}/gdpr/privacy-settings/test`, method: 'GET' }
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer invalid-token`
        },
        body: endpoint.method === 'POST' ? JSON.stringify({ userId: 'test' }) : undefined
      });
      
      // We expect 401 (unauthorized) or 400 (bad request), not 404
      if (response.status === 404) {
        console.log(`❌ ${endpoint.name}: Not Found (404)`);
      } else if (response.status === 401) {
        console.log(`✅ ${endpoint.name}: Available (401 - needs auth)`);
      } else if (response.status === 400) {
        console.log(`✅ ${endpoint.name}: Available (400 - bad request)`);
      } else {
        console.log(`⚠️  ${endpoint.name}: Unexpected status ${response.status}`);
      }
    } catch (error) {
      console.log(`💥 ${endpoint.name}: Connection failed`);
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 ZyncJobs Account Deletion Test Suite\n');
  
  // Check if configuration is set
  if (TEST_CONFIG.testToken === 'your-test-jwt-token-here') {
    console.log('⚠️  Please update TEST_CONFIG with real test credentials');
    console.log('📝 For now, running endpoint availability tests only\n');
    await testEndpointAvailability();
    return;
  }
  
  await testEndpointAvailability();
  console.log('\n' + '='.repeat(50) + '\n');
  await testAccountDeletion();
  
  console.log('\n✨ Test suite completed!');
}

main().catch(console.error);