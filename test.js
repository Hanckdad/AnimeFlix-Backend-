const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testEndpoints() {
  console.log('🧪 Testing AnimeFlix Backend API...\n');

  const endpoints = [
    '/api/latest',
    '/api/ongoing',
    '/api/completed/1',
    '/api/search/naruto',
    '/api/schedule',
    '/api/genres',
    '/health'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing: ${endpoint}`);
      const response = await axios.get(BASE_URL + endpoint, { timeout: 10000 });
      console.log(`✅ SUCCESS: ${endpoint} - Status: ${response.status}`);
      
      if (response.data && Array.isArray(response.data)) {
        console.log(`   Data count: ${response.data.length}`);
      } else if (response.data && typeof response.data === 'object') {
        console.log(`   Data keys: ${Object.keys(response.data).join(', ')}`);
      }
      
    } catch (error) {
      console.log(`❌ FAILED: ${endpoint} - ${error.message}`);
    }
    console.log('---');
  }
}

testEndpoints();