import express from 'express';
import http from 'http';
import path from 'path';
import { config } from './server/config';
import { db } from './server/db';
import { CleanupService } from './server/services/cleanup.service';
import { RealtimeService } from './server/services/realtime.service';
import apiRouter from './server/routes/api';
import healthRouter from './server/routes/health';

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  // Database initialization
  await db.init();
  console.log('[2MinChat] Database engine initialized.');

  // Background expiration cleanup service
  CleanupService.start();
  console.log('[2MinChat] Background expiration sweeper started.');

  // Real-time WebSockets
  RealtimeService.init(server);
  console.log('[2MinChat] WebSocket service initialized.');

  // CORS Middleware
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-session-token, x-room-token'
    );
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Security Headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Health check endpoint (for Render & Monitoring)
  app.use('/health', healthRouter);

  // API Router
  app.use('/api', apiRouter);

  // Frontend Serving (Vite in Dev, Dist static in Production)
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Render requirement: use dynamic process.env.PORT, bind to 0.0.0.0
  server.listen(config.port, '0.0.0.0', () => {
    console.log(
      `[2MinChat] Production server running on http://0.0.0.0:${config.port} (${
        isProd ? 'Production' : 'Development'
      })`
    );
  });
}

bootstrap().catch((err) => {
  console.error('[2MinChat] Fatal error starting server:', err);
  process.exit(1);
});
