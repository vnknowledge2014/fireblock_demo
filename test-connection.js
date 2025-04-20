// test-connection.js
const { FireblocksSDK } = require('fireblocks-sdk');
const fs = require('fs');
require('dotenv').config();

async function testConnection() {
  try {
    const apiKey = process.env.FIREBLOCKS_API_KEY;
    const privateKey = fs.readFileSync(process.env.FIREBLOCKS_API_SECRET_PATH, 'utf8');
    const baseUrlPath = process.env.FIREBLOCKS_API_BASE_URL;

    console.log(apiKey, privateKey);
    
    console.log(`Testing connection with API Key: ${apiKey.substring(0, 8)}...`);
    const fireblocks = new FireblocksSDK(privateKey, apiKey, baseUrlPath);
    
    // Try a simple API call
    const supportedAssets = await fireblocks.getSupportedAssets();
    console.log('Connection successful!');
    console.log(`Retrieved ${supportedAssets.length} supported assets`);
  } catch (error) {
    console.error('Connection failed:');
    console.error(error.message);
    if (error.response && error.response.data) {
      console.error('Error details:', error.response.data);
    }
  }
}

testConnection();