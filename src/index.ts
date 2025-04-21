import { Hono } from 'hono';
import { Effect, pipe } from 'effect';
import { Fireblocks, BasePath } from "@fireblocks/ts-sdk";

// =====================
// Domain Models and Errors
// =====================
// Custom error types for better error handling
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

// Domain models
interface Config {
  readonly apiKey: string;
  readonly secretPath: string;
  readonly basePath?: string;
  readonly cryptoMarketDataApi: string;
}

// Interface cho dữ liệu giá tiền điện tử
interface CryptoPrice {
  [currency: string]: number; // e.g., { "USD": 50000, "EUR": 45000, "AUD": 70000 }
}

interface CryptoPrices {
  [symbol: string]: CryptoPrice; // e.g., { "BTC": {...}, "ETH": {...} }
}

// =====================
// Service Definitions
// =====================
// Define service interfaces
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
// Get and validate config with better error handling
const getConfig = Effect.gen(function* (_) {
  const apiKey = process.env.FIREBLOCKS_API_KEY;
  const secretPath = process.env.FIREBLOCKS_API_SECRET_PATH;
  const basePath = process.env.FIREBLOCKS_API_BASE_URL;
  const cryptoMarketDataApi = process.env.CRYPTO_MARKET_DATA_API;
  
  if (!apiKey) {
    yield* Effect.fail(new ConfigError('Missing FIREBLOCKS_API_KEY'));
  }
  
  if (!secretPath) {
    yield* Effect.fail(new ConfigError('Missing FIREBLOCKS_API_SECRET_PATH'));
  }
  
  if (!cryptoMarketDataApi) {
    yield* Effect.fail(new ConfigError('Missing CRYPTO_MARKET_DATA_API'));
  }
  
  return { apiKey, secretPath, basePath, cryptoMarketDataApi } as Config;
});

// Read private key with proper error handling
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
// Create Fireblocks service
const createFireblocksService = (config: Config, privateKey: string): Effect.Effect<never, Error, FireblocksService> => 
  Effect.try({
    try: () => {
      // Initialize the new Fireblocks SDK
      const client = new Fireblocks({
        apiKey: config.apiKey,
        secretKey: privateKey,
        basePath: config.basePath || BasePath.Sandbox
      });
      
      const service: FireblocksService = {
        client
      };
      
      return service;
    },
    catch: error => new Error(`Failed to create Fireblocks service: ${error}`)
  });

// Tạo service CryptoMarketData
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
              
              console.log(`Fetching prices for symbols: ${symbols.join(',')} in currencies: ${currencies.join(',')}`);
              console.log(`URL: ${url.toString()}`);
              
              const response = await fetch(url, {
                method: 'GET',
                headers: { "Content-type": "application/json; charset=UTF-8" }
              });
              
              if (!response.ok) {
                throw new Error(`Failed to fetch crypto prices: ${response.statusText}`);
              }
              
              const data = await response.json();
              console.log('Price data response:', data);
              return data;
            },
            catch: error => new CryptoMarketDataError(`Crypto market data error: ${error}`)
          })
      };
      
      return service;
    },
    catch: error => new Error(`Failed to create crypto market data service: ${error}`)
  });

// Helper function to wrap Fireblocks API calls with proper error handling
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

// Create a Hono app
const createApp = Effect.sync(() => new Hono());

// Combine to create the full environment
const createAppEnv = Effect.gen(function* (_) {
  // Get configuration
  const config = yield* getConfig;
  
  // Read the private key
  const privateKey = yield* readPrivateKey(config.secretPath);
  
  // Create the services
  const fireblocks = yield* createFireblocksService(config, privateKey);
  const cryptoMarketData = yield* createCryptoMarketDataService(config);
  const app = yield* createApp;
  
  // Return the combined environment
  return { fireblocks, cryptoMarketData, app };
});

// =====================
// Route Handlers
// =====================
// Root endpoint handler
const handleRoot = ({ app }: AppEnv) => 
  Effect.sync(() => {
    app.get('/', (c) => c.json({ message: 'Fireblocks Demo API' }));
    return app;
  });

// Get vault accounts handler
const handleVaultAccounts = ({ app, fireblocks, cryptoMarketData }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/vault-accounts', async (c) => {
      try {
        const vaultAccountsResponse = await fireblocks.client.vaults.getPagedVaultAccounts({});
        
        // If the response has the expected structure with data.accounts
        if (vaultAccountsResponse && vaultAccountsResponse.data && Array.isArray(vaultAccountsResponse.data.accounts)) {
          // Process each account
          for (const account of vaultAccountsResponse.data.accounts) {
            if (Array.isArray(account.assets)) {
              // Get unique crypto symbols
              const symbols = [...new Set(account.assets.map(asset => {
                const parts = asset.id?.split('_') || [];
                return parts[0] || '';
              }))].filter(Boolean);
              
              // Get price data
              let prices = {};
              if (symbols.length > 0) {
                try {
                  prices = await Effect.runPromise(
                    cryptoMarketData.getPrices(symbols, ['USD', 'AUD'])
                  );
                } catch (error) {
                  console.error('Error fetching prices:', error);
                }
              }
              
              // Add price data to each asset
              account.assets = account.assets.map(asset => {
                const symbol = (asset.id?.split('_')[0]) || '';
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
              });
              
              // Calculate total value for all assets in this account
              const totalBalances = account.assets.reduce((acc, asset) => {
                if (asset.calculatedValues?.USD && !isNaN(asset.calculatedValues.USD)) {
                  acc.USD += asset.calculatedValues.USD;
                }
                if (asset.calculatedValues?.AUD && !isNaN(asset.calculatedValues.AUD)) {
                  acc.AUD += asset.calculatedValues.AUD;
                }
                return acc;
              }, { USD: 0, AUD: 0 });
              
              // Add assetBalances at the same level as id
              account.assetBalances = totalBalances;
            }
          }
        }
        
        return c.json(vaultAccountsResponse);
      } catch (error) {
        console.error('Error fetching vault accounts:', error);
        const statusCode = error.status || 500;
        return c.json({ 
          error: error.message || 'Error fetching vault accounts', 
          status: statusCode 
        }, statusCode);
      }
    });
    
    return app;
  });

// Get vault account by ID handler
const handleVaultAccountById = ({ app, fireblocks, cryptoMarketData }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/vault-accounts/:vaultAccountId', async (c) => {
      const vaultAccountId = c.req.param('vaultAccountId');
      
      try {
        const vaultAccount = await fireblocks.client.vaults.getVaultAccount({ vaultAccountId });
        
        // Kiểm tra xem vaultAccount.data.assets có tồn tại không
        if (vaultAccount.data && Array.isArray(vaultAccount.data.assets)) {
          try {
            // Lấy các ký hiệu tiền điện tử duy nhất từ mảng assets
            const symbols = [...new Set(vaultAccount.data.assets.map(asset => {
              const parts = asset.id?.split('_') || [];
              return parts[0] || '';
            }))].filter(Boolean);
            
            // Lấy thông tin giá
            let prices = {};
            try {
              if (symbols.length > 0) {
                prices = await Effect.runPromise(
                  cryptoMarketData.getPrices(symbols, ['USD', 'AUD'])
                );
              }
            } catch (error) {
              console.error('Error fetching prices:', error);
            }
            
            // Thêm thông tin giá và tính giá trị quy đổi vào từng asset
            vaultAccount.data.assets = vaultAccount.data.assets.map(asset => {
              const symbol = (asset.id?.split('_')[0]) || '';
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
            });
            
            // Tính tổng giá trị của tất cả tài sản
            const totalBalances = vaultAccount.data.assets.reduce((acc, asset) => {
              if (asset.calculatedValues.USD && !isNaN(asset.calculatedValues.USD)) {
                acc.USD += asset.calculatedValues.USD;
              }
              if (asset.calculatedValues.AUD && !isNaN(asset.calculatedValues.AUD)) {
                acc.AUD += asset.calculatedValues.AUD;
              }
              return acc;
            }, { USD: 0, AUD: 0 });
            
            // Thêm tổng giá trị vào vaultAccount
            vaultAccount.data.assetBalances = totalBalances;
          } catch (error) {
            console.error(`Error processing assets for vault ${vaultAccountId}:`, error);
          }
        }
        
        return c.json(vaultAccount);
      } catch (error) {
        console.error(`Error fetching vault account:`, error);
        const statusCode = error.status || 500;
        return c.json({ 
          error: error.message || 'Error fetching vault account', 
          status: statusCode 
        }, statusCode);
      }
    });
    
    return app;
  });

// Get all vault assets for an account with price data
const handleVaultAccountAssets = ({ app, fireblocks, cryptoMarketData }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/vault-accounts/:vaultAccountId/assets', async (c) => {
      const vaultAccountId = c.req.param('vaultAccountId');

      if (!vaultAccountId) {
        return c.json({ 
          error: 'Vault account ID is required', 
          status: 400 
        }, 400);
      }
      
      try {
        const assetsResponse = await fireblocks.client.vaults.getVaultAccountAssetsByVaultAccountId({ vaultAccountId });
        
        // Đảm bảo assetsResponse là mảng
        const assets = Array.isArray(assetsResponse) ? assetsResponse : [];
        
        if (assets.length === 0) {
          return c.json([]);
        }
        
        // Extract unique symbols from all assets
        const symbols = [...new Set(assets.map(asset => {
          const parts = asset.id?.split('_') || [];
          return parts[0] || ''; 
        }))].filter(Boolean);
        
        // Lấy thông tin giá
        let prices = {};
        try {
          if (symbols.length > 0) {
            prices = await Effect.runPromise(
              cryptoMarketData.getPrices(symbols, ['USD', 'AUD'])
            );
          }
        } catch (error) {
          console.error('Error fetching prices:', error);
        }
        
        // Enhance each asset with price data
        const assetsWithPrices = assets.map(asset => {
          const symbol = (asset.id?.split('_')[0]) || '';
          const priceData = symbol ? prices[symbol] : null;
          const balance = parseFloat(asset.available || "0");
          
          if (asset.data) {
            // Nếu asset có cấu trúc data
            return {
              ...asset,
              data: {
                ...asset.data,
                unitPrice: priceData || { USD: null, AUD: null },
                calculatedValues: {
                  USD: priceData?.USD ? balance * priceData.USD : null,
                  AUD: priceData?.AUD ? balance * priceData.AUD : null
                }
              }
            };
          } else {
            // Nếu asset không có cấu trúc data
            return {
              ...asset,
              unitPrice: priceData || { USD: null, AUD: null },
              calculatedValues: {
                USD: priceData?.USD ? balance * priceData.USD : null,
                AUD: priceData?.AUD ? balance * priceData.AUD : null
              }
            };
          }
        });
        
        return c.json(assetsWithPrices);
      } catch (error) {
        console.error(`Error fetching vault assets:`, error);
        const statusCode = error.status || 500;
        return c.json({ 
          error: error.message || 'Error fetching assets', 
          status: statusCode 
        }, statusCode);
      }
    });
    
    return app;
  });

// Get vault asset by ID with price data
const handleVaultAssets = ({ app, fireblocks, cryptoMarketData }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/vault-accounts/:vaultAccountId/:assetId', async (c) => {
      const vaultAccountId = c.req.param('vaultAccountId');
      const assetId = c.req.param('assetId');

      if (!vaultAccountId) {
        return c.json({ 
          error: 'Vault account ID is required', 
          status: 400 
        }, 400);
      }
      
      try {
        // Lấy dữ liệu tài sản
        const assetResponse = await fireblocks.client.vaults.getVaultAccountAsset({ 
          vaultAccountId, 
          assetId 
        });
        
        // Lấy thông tin giá
        const symbol = assetId.split('_')[0];
        let priceData = null;
        
        try {
          const prices = await Effect.runPromise(
            cryptoMarketData.getPrices([symbol], ['USD', 'AUD'])
          );
          priceData = prices[symbol];
          console.log("Price data for", symbol, ":", priceData);
        } catch (error) {
          console.error('Error fetching price data:', error);
        }
        
        // Kiểm tra cấu trúc dữ liệu và trích xuất balance
        let balance = 0;
        if (assetResponse.data && assetResponse.data.available) {
          balance = parseFloat(assetResponse.data.available);
        } else if (assetResponse.available) {
          balance = parseFloat(assetResponse.available);
        }
        
        console.log("Balance:", balance, "Type:", typeof balance);
        
        // Tính toán giá trị
        const calculatedUSD = priceData?.USD ? balance * priceData.USD : null;
        const calculatedAUD = priceData?.AUD ? balance * priceData.AUD : null;
        
        console.log("Calculated values - USD:", calculatedUSD, "AUD:", calculatedAUD);
        
        // Thêm thông tin giá và giá trị tính toán vào đúng vị trí
        let responseData;
        
        if (assetResponse.data) {
          responseData = {
            ...assetResponse,
            data: {
              ...assetResponse.data,
              unitPrice: priceData || { USD: null, AUD: null },
              calculatedValues: {
                USD: calculatedUSD,
                AUD: calculatedAUD
              }
            }
          };
        } else {
          responseData = {
            ...assetResponse,
            unitPrice: priceData || { USD: null, AUD: null },
            calculatedValues: {
              USD: calculatedUSD,
              AUD: calculatedAUD
            }
          };
        }
        
        return c.json(responseData);
      } catch (error) {
        console.error(`Error processing vault asset:`, error);
        
        // Check for specific errors and provide appropriate message
        if (error.message && (
            error.message.includes("not found") || 
            error.message.includes("not supported") ||
            error.message.includes("not exist")
        )) {
          return c.json({ 
            error: `Asset '${assetId}' is not supported or doesn't exist in this wallet`,
            status: 404 
          }, 404);
        }
        
        const statusCode = error.status || 500;
        return c.json({ 
          error: error.message || 'Error processing asset', 
          status: statusCode 
        }, statusCode);
      }
    });
    
    return app;
  });

// Get supported assets handler - không cần cryptoMarketData
const handleSupportedAssets = ({ app, fireblocks }: Omit<AppEnv, 'cryptoMarketData'>) => 
  Effect.sync(() => {
    app.get('/api/supported-assets', async (c) => {
      try {
        const assetsResponse = await fireblocks.client.blockchainsAssets.getSupportedAssets();
        console.log("Raw supported assets response:", 
          typeof assetsResponse, 
          Array.isArray(assetsResponse), 
          JSON.stringify(assetsResponse).substring(0, 500)
        );
        
        if (!assetsResponse) {
          return c.json([]);
        }
        
        // Extract assets array from response
        let assets = [];
        
        if (Array.isArray(assetsResponse)) {
          assets = assetsResponse;
        } else if (assetsResponse && typeof assetsResponse === 'object') {
          if (assetsResponse.data && Array.isArray(assetsResponse.data)) {
            assets = assetsResponse.data;
          } else if (assetsResponse.assets && Array.isArray(assetsResponse.assets)) {
            assets = assetsResponse.assets;
          } else if (assetsResponse.supportedAssets && Array.isArray(assetsResponse.supportedAssets)) {
            assets = assetsResponse.supportedAssets;
          } else {
            // Return raw response if structure is unknown
            return c.json(assetsResponse);
          }
        }
        
        if (assets.length === 0) {
          return c.json([]);
        }
        
        // Filter valid assets and return them directly
        const validAssets = assets.filter(asset => asset && typeof asset === 'object' && asset.id);
        return c.json(validAssets);
        
      } catch (error) {
        console.error('Error fetching supported assets:', error);
        const statusCode = error.status || 500;
        return c.json({ 
          error: error.message || 'Error fetching supported assets', 
          status: statusCode 
        }, statusCode);
      }
    });
    
    return app;
  });

// Get transactions handler
const handleTransactions = ({ app, fireblocks }: Omit<AppEnv, 'cryptoMarketData'>) => 
  Effect.sync(() => {
    app.get('/api/transactions', async (c) => {
      try {
        const transactions = await fireblocks.client.transactions.getTransactions({});
        return c.json(transactions);
      } catch (error) {
        console.error('Error fetching transactions:', error);
        const statusCode = error.status || 500;
        return c.json({ 
          error: error.message || 'Error fetching transactions', 
          status: statusCode 
        }, statusCode);
      }
    });
    
    return app;
  });

// =====================
// App Setup
// =====================
// Compose all route handlers using pipe
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
    console.error('Application setup failed:', error);
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
// Run the main effect to start the server
const port = Number(process.env.PORT) || 3000;

// Export for Bun
export default {
  port,
  fetch: async (request: Request) => {
    try {
      // We create a static app instance to avoid recreating it on every request
      const app = await Effect.runPromise(setupApp);
      return app.fetch(request);
    } catch (error) {
      console.error("Error handling request:", error);
      const fallbackApp = new Hono();
      fallbackApp.all('*', (c) => c.json({ 
        error: 'Server error', 
        status: 500 
      }, 500));
      return fallbackApp.fetch(request);
    }
  }
};

// Start the server
Effect.runPromise(setupApp).then(app => {
  console.log(`Server running on http://localhost:${port}`);
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});