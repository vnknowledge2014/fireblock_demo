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

// Domain models
interface Config {
  readonly apiKey: string;
  readonly secretPath: string;
  readonly basePath?: string;
}

// =====================
// Service Definitions (simple object approach)
// =====================
// Define service interfaces
interface FireblocksService {
  readonly client: Fireblocks;
}

interface AppEnv {
  readonly fireblocks: FireblocksService;
  readonly app: Hono;
}

// =====================
// Pure Functions for Configuration
// =====================
// Get and validate config with better error handling
const getConfig = Effect.gen(function* (_) {
  const apiKey = process.env.FIREBLOCKS_API_KEY;
  const secretPath = process.env.FIREBLOCKS_API_SECRET_PATH;
  const basePath = process.env.FIREBLOCKS_BASE_PATH;
  
  if (!apiKey) {
    yield* Effect.fail(new ConfigError('Missing FIREBLOCKS_API_KEY'));
  }
  
  if (!secretPath) {
    yield* Effect.fail(new ConfigError('Missing FIREBLOCKS_API_SECRET_PATH'));
  }
  
  return { apiKey, secretPath, basePath } as Config;
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
  const app = yield* createApp;
  
  // Return the combined environment
  return { fireblocks, app };
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
const handleVaultAccounts = ({ app, fireblocks }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/vault-accounts', async (c) => {
      const result = await Effect.runPromise(
        wrapFireblocksCall(() => fireblocks.client.vaults.getPagedVaultAccounts({}))
          .pipe(
            Effect.match({
              onFailure: (error: FireblocksApiError) => {
                console.error('Error fetching vault accounts:', error);
                return c.json({ error: error.message }, error.status || 500);
              },
              onSuccess: (vaultAccounts) => c.json(vaultAccounts)
            })
          )
      );
      return result;
    });
    
    return app;
  });

// Get vault account by ID handler
const handleVaultAccountById = ({ app, fireblocks }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/vault-accounts/:vaultAccountId', async (c) => {
      const vaultAccountId = c.req.param('vaultAccountId');
      
      const result = await Effect.runPromise(
        wrapFireblocksCall(() => fireblocks.client.vaults.getVaultAccount({ vaultAccountId }))
          .pipe(
            Effect.match({
              onFailure: (error: FireblocksApiError) => {
                console.error(`Error fetching vault account:`, error);
                return c.json({ error: error.message }, error.status || 500);
              },
              onSuccess: (vaultAccount) => c.json(vaultAccount)
            })
          )
      );
      
      return result;
    });
    
    return app;
  });

// Get vault assets handler
const handleVaultAssets = ({ app, fireblocks }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/vault-accounts/:vaultAccountId/:assetId', async (c) => {
      const vaultAccountId = c.req.param('vaultAccountId');
      const assetId = c.req.param('assetId');

      if (!vaultAccountId) {
        return c.json({ error: 'Vault account ID is required' }, 400);
      }
      
      const result = await Effect.runPromise(
        wrapFireblocksCall(() => fireblocks.client.vaults.getVaultAccountAsset({ vaultAccountId, assetId }))
          .pipe(
            Effect.match({
              onFailure: (error: FireblocksApiError) => {
                console.error(`Error fetching vault assets:`, error);
                return c.json({ error: error.message }, error.status || 500);
              },
              onSuccess: (assets) => c.json(assets)
            })
          )
      );
      
      return result;
    });
    
    return app;
  });

// Get supported assets handler
const handleSupportedAssets = ({ app, fireblocks }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/supported-assets', async (c) => {
      const result = await Effect.runPromise(
        wrapFireblocksCall(() => fireblocks.client.blockchainsAssets.getSupportedAssets())
          .pipe(
            Effect.match({
              onFailure: (error: FireblocksApiError) => {
                console.error('Error fetching supported assets:', error);
                return c.json({ error: error.message }, error.status || 500);
              },
              onSuccess: (assets) => c.json(assets)
            })
          )
      );
      
      return result;
    });
    
    return app;
  });

// Get transactions handler
const handleTransactions = ({ app, fireblocks }: AppEnv) => 
  Effect.sync(() => {
    app.get('/api/transactions', async (c) => {
      const result = await Effect.runPromise(
        wrapFireblocksCall(() => fireblocks.client.transactions.getTransactions({}))
          .pipe(
            Effect.match({
              onFailure: (error: FireblocksApiError) => {
                console.error('Error fetching transactions:', error);
                return c.json({ error: error.message }, error.status || 500);
              },
              onSuccess: (transactions) => c.json(transactions)
            })
          )
      );
      
      return result;
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
      Effect.flatMap(() => handleVaultAssets(env)),
      Effect.flatMap(() => handleSupportedAssets(env)),
      Effect.flatMap(() => handleTransactions(env)),
      Effect.map(() => env.app)
    )
  ),
  Effect.catchAll(error => {
    console.error('Application setup failed:', error);
    return Effect.sync(() => {
      const fallbackApp = new Hono();
      fallbackApp.all('*', (c) => c.json({ error: 'Server configuration error' }, 500));
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
      fallbackApp.all('*', (c) => c.json({ error: 'Server error' }, 500));
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