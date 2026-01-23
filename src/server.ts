import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import chatRoutes from './routes/chat';
import storageRoutes from './routes/storage';
import authRoutes from './routes/auth';
import githubRoutes from './routes/github';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration - allow all origins in development
app.use(
  cors({
    origin: process.env.NODE_ENV === 'development' ? true : process.env.CORS_ORIGINS?.split(','),
    credentials: true,
  })
);

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
app.use('/api/chat', chatRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/github', githubRoutes);
app.use('/auth', authRoutes);

// OAuth callback endpoint for OneDrive
app.get('/auth/callback', (req: Request, res: Response) => {
  const { code, error, error_description } = req.query;

  if (error) {
    res.status(400).send(`
      <html>
        <body>
          <h1>Authentication Error</h1>
          <p>${error}: ${error_description}</p>
          <script>
            window.close();
          </script>
        </body>
      </html>
    `);
    return;
  }

  // Send the code back to the mobile app
  // In production, you'd exchange this for tokens server-side
  res.send(`
    <html>
      <body>
        <h1>Authentication Successful</h1>
        <p>You can close this window.</p>
        <script>
          // For Expo, we can use deep linking
          const code = "${code}";
          window.location.href = "poolsidecode://auth?code=" + code;
          setTimeout(() => window.close(), 1000);
        </script>
      </body>
    </html>
  `);
});

// Token exchange endpoint
app.post('/auth/token', async (req: Request, res: Response) => {
  try {
    const { code, redirect_uri } = req.body;

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      res.status(500).json({ error: 'Microsoft OAuth not configured' });
      return;
    }

    const tokenResponse = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirect_uri || process.env.MICROSOFT_REDIRECT_URI || '',
          grant_type: 'authorization_code',
        }),
      }
    );

    const tokens = await tokenResponse.json() as Record<string, unknown>;

    if (tokens.error) {
      res.status(400).json(tokens);
      return;
    }

    res.json(tokens);
  } catch (error) {
    console.error('Token exchange error:', error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

// Refresh token endpoint
app.post('/auth/refresh', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      res.status(500).json({ error: 'Microsoft OAuth not configured' });
      return;
    }

    const tokenResponse = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token,
          grant_type: 'refresh_token',
        }),
      }
    );

    const tokens = await tokenResponse.json() as Record<string, unknown>;

    if (tokens.error) {
      res.status(400).json(tokens);
      return;
    }

    res.json(tokens);
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

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
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   🏊 Poolside Code Backend Server                         ║
║   Running on: http://localhost:${PORT}                     ║
║   Environment: ${process.env.NODE_ENV || 'development'}                          ║
║                                                           ║
║   Auth:     POST /auth/register, /login, /refresh, /me    ║
║   Chat:     POST /api/chat                                ║
║   Storage:  /api/storage/*                                ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
