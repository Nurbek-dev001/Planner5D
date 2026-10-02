import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler, HttpError } from './http';
import { authRouter } from './routes/auth';
import { projectsRouter } from './routes/projects';
import { catalogRouter, materialsRouter } from './routes/catalog';
import { aiRouter } from './routes/ai';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  // Project JSON + small thumbnail; plan images for AI recognition are larger
  app.use('/api/ai', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/materials', materialsRouter);
  app.use('/api/ai', aiRouter);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use(errorHandler);
  return app;
}
