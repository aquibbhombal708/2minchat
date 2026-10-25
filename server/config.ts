import path from 'path';

export const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || '',
  appSecret: process.env.APP_SECRET || '2minchat_ephemeral_cryptographic_secret_2026',
  storageType: process.env.STORAGE_TYPE || (process.env.DATABASE_URL ? 'db' : 'local'),
  dataDir: path.resolve(process.cwd(), 'data'),
  mediaDir: path.resolve(process.cwd(), 'data', 'media'),
  maxFileSize: 50 * 1024 * 1024, // 50MB
  rateLimitMaxAttempts: 5,
  rateLimitLockoutSeconds: 60,
  cleanupIntervalMs: 10000, // 10 seconds
};
