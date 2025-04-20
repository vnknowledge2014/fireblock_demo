import { Hono } from 'hono';
import { FireblocksSDK } from 'fireblocks-sdk';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
config();

// Initialize Fireblocks SDK
const apiKey = process.env.FIREBLOCKS_API_KEY;
const apiSecretPath = process.env.FIREBLOCKS_API_SECRET_PATH;

if (!apiKey || !apiSecretPath) {
  throw new Error('FIREBLOCKS_API_KEY and FIREBLOCKS_API_SECRET_PATH must be set in .env file');
}

let fireblocks;
try {
  const privateKey = fs.readFileSync(path.resolve(process.cwd(), apiSecretPath), 'utf8');
  
  // Validate private key format
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('Invalid private key format');
  }
  
  console.log(`Initializing Fireblocks SDK with API Key: ${apiKey.substring(0, 8)}...`);
  fireblocks = new FireblocksSDK(privateKey, apiKey);
} catch (error) {
  console.error('Error initializing Fireblocks SDK:', error);
  throw new Error(`Failed to initialize Fireblocks SDK: ${error.message}`);
}

// Initialize Hono app
const app = new Hono();

// Root endpoint
app.get('/', (c) => {
  return c.json({ message: 'Fireblocks Demo API' });
});

// Get all vault accounts
app.get('/api/vault-accounts', async (c) => {
  try {
    const vaultAccounts = await fireblocks.getVaultAccountsWithPageInfo({});
    return c.json(vaultAccounts);
  } catch (error) {
    console.error('Error fetching vault accounts:', error);
    // Check if it's an authentication error (401)
    if (error.message && error.message.includes('401')) {
      return c.json({ error: 'Authentication failed. Please check your API credentials.' }, 401);
    }
    return c.json({ error: 'Failed to fetch vault accounts' }, 500);
  }
});

// Get vault account by ID
app.get('/api/vault-accounts/:vaultAccountId', async (c) => {
  try {
    const vaultAccountId = c.req.param('vaultAccountId');
    const vaultAccount = await fireblocks.getVaultAccountById(vaultAccountId);
    return c.json(vaultAccount);
  } catch (error) {
    console.error(`Error fetching vault account:`, error);
    // Check if it's an authentication error (401)
    if (error.message && error.message.includes('401')) {
      return c.json({ error: 'Authentication failed. Please check your API credentials.' }, 401);
    }
    return c.json({ error: 'Failed to fetch vault account' }, 500);
  }
});

// Get vault assets
app.get('/api/vault-accounts/:vaultAccountId/assets', async (c) => {
  try {
    const vaultAccountId = c.req.param('vaultAccountId');
    const assets = await fireblocks.getVaultAccountAssets(vaultAccountId);
    return c.json(assets);
  } catch (error) {
    console.error(`Error fetching vault assets:`, error);
    // Check if it's an authentication error (401)
    if (error.message && error.message.includes('401')) {
      return c.json({ error: 'Authentication failed. Please check your API credentials.' }, 401);
    }
    return c.json({ error: 'Failed to fetch vault assets' }, 500);
  }
});

// Get supported assets
app.get('/api/supported-assets', async (c) => {
  try {
    const assets = await fireblocks.getSupportedAssets();
    return c.json(assets);
  } catch (error) {
    console.error('Error fetching supported assets:', error);
    // Check if it's an authentication error (401)
    if (error.message && error.message.includes('401')) {
      return c.json({ error: 'Authentication failed. Please check your API credentials.' }, 401);
    }
    return c.json({ error: 'Failed to fetch supported assets' }, 500);
  }
});

// Get transactions
app.get('/api/transactions', async (c) => {
  try {
    const transactions = await fireblocks.getTransactions();
    return c.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    // Check if it's an authentication error (401)
    if (error.message && error.message.includes('401')) {
      return c.json({ error: 'Authentication failed. Please check your API credentials.' }, 401);
    }
    return c.json({ error: 'Failed to fetch transactions' }, 500);
  }
});

// Start the server
const port = process.env.PORT || 3000;

console.log(`Server is running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};