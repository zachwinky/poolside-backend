import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import chatRoutes from '../src/routes/chat';
import storageRoutes from '../src/routes/storage';
import authRoutes from '../src/routes/auth';

const app = express();

// CORS configuration
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production'
      ? process.env.CORS_ORIGINS?.split(',') || true
      : true,
    credentials: true,
  })
);

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Poolside Code API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/auth/*',
      chat: '/api/chat',
      storage: '/api/storage/*',
    },
  });
});

// API routes
app.use('/api/chat', chatRoutes);
app.use('/api/storage', storageRoutes);
app.use('/auth', authRoutes);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

export default app;
