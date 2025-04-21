import { Hono } from 'hono';
import { Effect, pipe } from 'effect';
import { Fireblocks, BasePath } from "@fireblocks/ts-sdk";

// =====================
// Domain Models and Errors
// =====================
class ConfigError extends Error {
  readonly _tag = 'ConfigError';
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

class PrivateKeyError extends Error {
  readonly _tag = 'PrivateKeyError';
  constructor(message: string) {
    super(message);
    this.name = 'PrivateKeyError';
  }
}

class FireblocksApiError extends Error {
  readonly _tag = 'FireblocksApiError';
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'FireblocksApiError';
    this.status = status;
  }
}

class CryptoMarketDataError extends Error {
  readonly _tag = 'CryptoMarketDataError';
  constructor(message: string) {
    super(message);
    this.name = 'CryptoMarketDataError';
  }
}

interface Config {
  readonly apiKey: string;
  readonly secretPath: string;
  readonly basePath?: string;
  readonly cryptoMarketDataApi: string;
}

interface CryptoPrice {
  [currency: string]: number;
}

interface CryptoPrices {
  [symbol: string]: CryptoPrice;
}

// =====================
// Service Definitions
// =====================
interface FireblocksService {
  readonly client: Fireblocks;
}

interface CryptoMarketDataService {
  getPrices: (symbols: string[], currencies: string[]) => Effect.Effect<never, Error, CryptoPrices>;
}

interface AppEnv {
  readonly fireblocks: FireblocksService;
  readonly cryptoMarketData: CryptoMarketDataService;
  readonly app: Hono;
}

// =====================
// Pure Functions for Configuration
// =====================
const getConfig = Effect.gen(function* (_) {
  const apiKey = process.env.FIREBLOCKS_API_KEY;
  const secretPath = process.env.FIREBLOCKS_API_SECRET_PATH;
  const basePath = process.env.FIREBLOCKS_API_BASE_URL;
  const cryptoMarketDataApi = process.env.CRYPTO_MARKET_DATA_API;

  if (!apiKey) yield* Effect.fail(new ConfigError('Missing FIREBLOCKS_API_KEY'));
  if (!secretPath) yield* Effect.fail(new ConfigError('Missing FIREBLOCKS_API_SECRET_PATH'));
  if (!cryptoMarketDataApi) yield* Effect.fail(new ConfigError('Missing CRYPTO_MARKET_DATA_API'));

  return { apiKey, secretPath, basePath, cryptoMarketDataApi } as Config;
});

const readPrivateKey = (path: string) => 
  pipe(
    Effect.tryPromise({
      try: () => Bun.file(path).text(),
      catch: error => new PrivateKeyError(`Failed to read private key: ${error}`)
    }),
    Effect.flatMap(key => 
      key.includes('-----BEGIN PRIVATE KEY-----')
        ? Effect.succeed(key)
        : Effect.fail(new PrivateKeyError('Invalid private key format'))
    )
  );

// =====================
// Service Creation Functions
// =====================
const createFireblocksService = (config: Config, privateKey: string): Effect.Effect<never, Error, FireblocksService> => 
  Effect.try({
    try: () => {
      console.info({
        level: 'info',
        message: 'Initializing Fireblocks client',
        apiKey: '***',
        basePath: config.basePath
      });
      
      const client = new Fireblocks({
        apiKey: config.apiKey,
        secretKey: privateKey,
        basePath: config.basePath || BasePath.Sandbox
      });
      
      console.info({ level: 'info', message: 'Fireblocks client initialized successfully' });
      return { client };
    },
    catch: error => {
      console.error({ level: 'error', message: 'Fireblocks initialization failed', error: error.message });
      return new Error(`Failed to create Fireblocks service: ${error}`);
    }
  });

const createCryptoMarketDataService = (config: Config): Effect.Effect<never, Error, CryptoMarketDataService> => 
  Effect.try({
    try: () => {
      const service: CryptoMarketDataService = {
        getPrices: (symbols: string[], currencies: string[]) => 
          Effect.tryPromise({
            try: async () => {
              const url = new URL(`${config.cryptoMarketDataApi}/data/pricemulti`);
              url.search = new URLSearchParams({
                fsyms: symbols.join(','),
                tsyms: currencies.join(',')
              }).toString();
              
              console.debug({
                level: 'debug',
                message: 'Fetching crypto prices',
                symbols: symbols.join(','),
                currencies: currencies.join(','),
                url: url.toString()
              });

              const response = await fetch(url, {
                method: 'GET',
                headers: { "Content-type": "application/json; charset=UTF-8" }
              });

              if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
              }

              const data = await response.json();
              console.debug({ level: 'debug', message: 'Received price data', data });
              return data;
            },
            catch: error => new CryptoMarketDataError(`Crypto market data error: ${error}`)
          })
      };
      return service;
    },
    catch: error => new Error(`Failed to create crypto market data service: ${error}`)
  });

const wrapFireblocksCall = <T>(fn: () => Promise<T>) => 
  Effect.tryPromise({
    try: fn,
    catch: error => {
      if (error.message?.includes('401')) {
        return new FireblocksApiError('Authentication failed', 401);
      }
      return new FireblocksApiError(`API error: ${error.message}`, 500);
    }
  });

// Middleware logging
const createApp = Effect.sync(() => {
  const app = new Hono();
  
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const latency = Date.now() - start;
    
    console.info({
      level: 'info',
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      latency: `${latency}ms`,
      timestamp: new Date().toISOString()
    });
  });

  return app;
});

// =====================
// Route Handlers
// =====================
const handleRoot = ({ app }: AppEnv) => 
  Effect.sync(() => {
    app.get('/', (c) => {
      console.info({ level: 'info', message: 'Handling root request' });
      return c.json({ message: 'Fireblocks Demo API' });
    });
    return app;
  });

const handleVaultAccounts = ({ app, fireblocks, cryptoMarketData }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/vault-accounts', async (c) => {
      console.info({ level: 'info', message: 'Handling /api/vault-accounts request' });
      try {
        const vaultAccountsResponse = await fireblocks.client.vaults.getPagedVaultAccounts({});
        
        if (vaultAccountsResponse?.data?.accounts) {
          for (const account of vaultAccountsResponse.data.accounts) {
            const symbols = [...new Set(account.assets?.map(asset => 
              asset.id?.split('_')[0] || ''
            ))].filter(Boolean);
            
            let prices = {};
            if (symbols.length > 0) {
              console.debug({ level: 'debug', message: 'Fetching prices for account processing', symbols });
              prices = await Effect.runPromise(cryptoMarketData.getPrices(symbols, ['USD', 'AUD']));
            }
            
            account.assets = account.assets?.map(asset => {
              const symbol = asset.id?.split('_')[0] || '';
              const priceData = symbol ? prices[symbol] : null;
              const balance = parseFloat(asset.available || "0");
              
              return {
                ...asset,
                unitPrice: priceData || { USD: null, AUD: null },
                calculatedValues: {
                  USD: priceData?.USD ? balance * priceData.USD : null,
                  AUD: priceData?.AUD ? balance * priceData.AUD : null
                }
              };
            }) || [];
            
            account.assetBalances = account.assets.reduce((acc, asset) => ({
              USD: (acc.USD || 0) + (asset.calculatedValues?.USD || 0),
              AUD: (acc.AUD || 0) + (asset.calculatedValues?.AUD || 0)
            }), { USD: 0, AUD: 0 });
          }
        }
        
        return c.json(vaultAccountsResponse);
      } catch (error) {
        console.error({
          level: 'error',
          message: 'Error in /api/vault-accounts',
          error: error.message,
          stack: error.stack
        });
        const statusCode = error.status || 500;
        return c.json({ error: error.message, status: statusCode }, statusCode);
      }
    });
    return app;
  });

const handleVaultAccountById = ({ app, fireblocks, cryptoMarketData }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/vault-accounts/:vaultAccountId', async (c) => {
      const vaultAccountId = c.req.param('vaultAccountId');
      console.info({ level: 'info', message: `Handling /api/vault-accounts/${vaultAccountId} request` });
      
      try {
        const vaultAccount = await fireblocks.client.vaults.getVaultAccount({ vaultAccountId });
        
        if (vaultAccount.data?.assets) {
          const symbols = [...new Set(vaultAccount.data.assets.map(asset => 
            asset.id?.split('_')[0] || ''
          ))].filter(Boolean);
          
          let prices = {};
          if (symbols.length > 0) {
            console.debug({ level: 'debug', message: 'Fetching prices for vault account', symbols });
            prices = await Effect.runPromise(cryptoMarketData.getPrices(symbols, ['USD', 'AUD']));
          }
          
          vaultAccount.data.assets = vaultAccount.data.assets.map(asset => {
            const symbol = asset.id?.split('_')[0] || '';
            const priceData = prices[symbol] || { USD: null, AUD: null };
            const balance = parseFloat(asset.available || "0");
            
            return {
              ...asset,
              unitPrice: priceData,
              calculatedValues: {
                USD: priceData.USD ? balance * priceData.USD : null,
                AUD: priceData.AUD ? balance * priceData.AUD : null
              }
            };
          });
          
          vaultAccount.data.assetBalances = vaultAccount.data.assets.reduce((acc, asset) => ({
            USD: (acc.USD || 0) + (asset.calculatedValues?.USD || 0),
            AUD: (acc.AUD || 0) + (asset.calculatedValues?.AUD || 0)
          }), { USD: 0, AUD: 0 });
        }
        
        return c.json(vaultAccount);
      } catch (error) {
        console.error({
          level: 'error',
          message: `Error in /api/vault-accounts/${vaultAccountId}`,
          error: error.message,
          stack: error.stack
        });
        const statusCode = error.status || 500;
        return c.json({ error: error.message, status: statusCode }, statusCode);
      }
    });
    return app;
  });

const handleVaultAccountAssets = ({ app, fireblocks, cryptoMarketData }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/vault-accounts/:vaultAccountId/assets', async (c) => {
      const vaultAccountId = c.req.param('vaultAccountId');
      console.info({ level: 'info', message: `Handling /api/vault-accounts/${vaultAccountId}/assets request` });
      
      if (!vaultAccountId) {
        return c.json({ error: 'Vault account ID is required', status: 400 }, 400);
      }
      
      try {
        const assetsResponse = await fireblocks.client.vaults.getVaultAccountAssetsByVaultAccountId({ vaultAccountId });
        const assets = Array.isArray(assetsResponse) ? assetsResponse : [];
        
        if (assets.length === 0) {
          return c.json([]);
        }
        
        const symbols = [...new Set(assets.map(asset => 
          asset.id?.split('_')[0] || ''
        ))].filter(Boolean);
        
        let prices = {};
        if (symbols.length > 0) {
          console.debug({ level: 'debug', message: 'Fetching prices for assets', symbols });
          prices = await Effect.runPromise(cryptoMarketData.getPrices(symbols, ['USD', 'AUD']));
        }
        
        const assetsWithPrices = assets.map(asset => {
          const symbol = asset.id?.split('_')[0] || '';
          const priceData = prices[symbol] || { USD: null, AUD: null };
          const balance = parseFloat(asset.available || "0");
          
          return {
            ...asset,
            unitPrice: priceData,
            calculatedValues: {
              USD: priceData.USD ? balance * priceData.USD : null,
              AUD: priceData.AUD ? balance * priceData.AUD : null
            }
          };
        });
        
        return c.json(assetsWithPrices);
      } catch (error) {
        console.error({
          level: 'error',
          message: `Error in /api/vault-accounts/${vaultAccountId}/assets`,
          error: error.message,
          stack: error.stack
        });
        const statusCode = error.status || 500;
        return c.json({ error: error.message, status: statusCode }, statusCode);
      }
    });
    return app;
  });

const handleVaultAssets = ({ app, fireblocks, cryptoMarketData }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/vault-accounts/:vaultAccountId/:assetId', async (c) => {
      const vaultAccountId = c.req.param('vaultAccountId');
      const assetId = c.req.param('assetId');
      console.info({ 
        level: 'info', 
        message: `Handling /api/vault-accounts/${vaultAccountId}/${assetId} request`
      });
      
      if (!vaultAccountId) {
        return c.json({ error: 'Vault account ID is required', status: 400 }, 400);
      }
      
      try {
        const assetResponse = await fireblocks.client.vaults.getVaultAccountAsset({ 
          vaultAccountId, 
          assetId 
        });
        
        const symbol = assetId.split('_')[0];
        let priceData = null;
        try {
          const prices = await Effect.runPromise(
            cryptoMarketData.getPrices([symbol], ['USD', 'AUD'])
          );
          priceData = prices[symbol];
          console.debug({ level: 'debug', message: 'Price data retrieved', symbol, priceData });
        } catch (error) {
          console.error({ level: 'warn', message: 'Price fetch failed', symbol, error: error.message });
        }
        
        const balance = parseFloat(assetResponse.available || "0");
        const calculatedUSD = priceData?.USD ? balance * priceData.USD : null;
        const calculatedAUD = priceData?.AUD ? balance * priceData.AUD : null;
        
        const responseData = {
          ...assetResponse,
          unitPrice: priceData || { USD: null, AUD: null },
          calculatedValues: {
            USD: calculatedUSD,
            AUD: calculatedAUD
          }
        };
        
        return c.json(responseData);
      } catch (error) {
        console.error({
          level: 'error',
          message: `Error in /api/vault-accounts/${vaultAccountId}/${assetId}`,
          error: error.message,
          stack: error.stack
        });
        
        if (error.message?.includes('not found')) {
          return c.json({ error: 'Asset not found', status: 404 }, 404);
        }
        const statusCode = error.status || 500;
        return c.json({ error: error.message, status: statusCode }, statusCode);
      }
    });
    return app;
  });

const handleSupportedAssets = ({ app, fireblocks }: Omit<AppEnv, 'cryptoMarketData'>) => 
  Effect.sync(() => {
    app.get('/api/supported-assets', async (c) => {
      console.info({ level: 'info', message: 'Handling /api/supported-assets request' });
      
      try {
        const assetsResponse = await fireblocks.client.blockchainsAssets.getSupportedAssets();
        console.debug({ level: 'debug', message: 'Supported assets response', data: assetsResponse });
        
        let assets = [];
        if (Array.isArray(assetsResponse)) {
          assets = assetsResponse;
        } else if (assetsResponse?.data) {
          assets = assetsResponse.data;
        }
        
        return c.json(assets);
      } catch (error) {
        console.error({
          level: 'error',
          message: 'Error in /api/supported-assets',
          error: error.message,
          stack: error.stack
        });
        const statusCode = error.status || 500;
        return c.json({ error: error.message, status: statusCode }, statusCode);
      }
    });
    return app;
  });

const handleTransactions = ({ app, fireblocks }: Omit<AppEnv, 'cryptoMarketData'>) => 
  Effect.sync(() => {
    app.get('/api/transactions', async (c) => {
      console.info({ level: 'info', message: 'Handling /api/transactions request' });
      
      try {
        const transactions = await fireblocks.client.transactions.getTransactions({});
        return c.json(transactions);
      } catch (error) {
        console.error({
          level: 'error',
          message: 'Error in /api/transactions',
          error: error.message,
          stack: error.stack
        });
        const statusCode = error.status || 500;
        return c.json({ error: error.message, status: statusCode }, statusCode);
      }
    });
    return app;
  });

// =====================
// Application Setup
// =====================
const createAppEnv = Effect.gen(function* (_) {
  const config = yield* getConfig;
  const privateKey = yield* readPrivateKey(config.secretPath);
  const fireblocks = yield* createFireblocksService(config, privateKey);
  const cryptoMarketData = yield* createCryptoMarketDataService(config);
  const app = yield* createApp;
  return { fireblocks, cryptoMarketData, app };
});

const setupApp = pipe(
  createAppEnv,
  Effect.flatMap(env => 
    pipe(
      handleRoot(env),
      Effect.flatMap(() => handleVaultAccounts(env)),
      Effect.flatMap(() => handleVaultAccountById(env)),
      Effect.flatMap(() => handleVaultAccountAssets(env)),
      Effect.flatMap(() => handleVaultAssets(env)),
      Effect.flatMap(() => handleSupportedAssets({ app: env.app, fireblocks: env.fireblocks })),
      Effect.flatMap(() => handleTransactions({ app: env.app, fireblocks: env.fireblocks })),
      Effect.map(() => env.app)
    )
  ),
  Effect.catchAll(error => {
    console.error({ 
      level: 'fatal',
      message: 'Application setup failed',
      error: error.message,
      stack: error.stack
    });
    return Effect.sync(() => {
      const fallbackApp = new Hono();
      fallbackApp.all('*', (c) => c.json({ 
        error: 'Server configuration error', 
        status: 500 
      }, 500));
      return fallbackApp;
    });
  })
);

// =====================
// Application Startup
// =====================
const port = Number(process.env.PORT) || 3000;

Effect.runPromise(setupApp).then(app => {
  console.info({
    level: 'info',
    message: 'Server started successfully',
    port: port,
    timestamp: new Date().toISOString()
  });
}).catch(error => {
  console.error({
    level: 'fatal',
    message: 'Server startup failed',
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

export default {
  port,
  fetch: async (request: Request) => {
    try {
      const app = await Effect.runPromise(setupApp);
      return app.fetch(request);
    } catch (error) {
      console.error({ 
        level: 'error',
        message: 'Request handling failed',
        error: error.message,
        stack: error.stack
      });
      const fallbackApp = new Hono();
      return fallbackApp.fetch(request);
    }
  }
};