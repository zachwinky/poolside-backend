import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import {
  authenticateToken,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  AuthenticatedRequest,
  JWTPayload,
} from '../middleware/auth';

const router = Router();

// POST /auth/register - Create a new account
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user with default subscription
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name: name || null,
        subscription: {
          create: {
            tier: 'free',
            status: 'active',
          },
        },
      },
      include: {
        subscription: true,
      },
    });

    // Generate tokens
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      tier: user.subscription?.tier || 'free',
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: {
          tier: user.subscription?.tier || 'free',
          status: user.subscription?.status || 'active',
        },
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /auth/login - Login with email/password
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        subscription: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Check if user has a password (not OAuth-only user)
    if (!user.passwordHash) {
      res.status(401).json({ error: 'Please sign in with Google' });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate tokens
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      tier: user.subscription?.tier || 'free',
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: {
          tier: user.subscription?.tier || 'free',
          status: user.subscription?.status || 'active',
        },
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /auth/refresh - Refresh access token using refresh token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);

    // Get latest user data
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        subscription: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    // Generate new tokens with latest tier
    const newPayload: JWTPayload = {
      userId: user.id,
      email: user.email,
      tier: user.subscription?.tier || 'free',
    };

    const accessToken = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// GET /auth/me - Get current user info
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: {
        subscription: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
        hasOneDrive: !!user.onedriveAccessToken,
        hasGithub: !!user.githubAccessToken,
        githubUsername: user.githubUsername,
        subscription: {
          tier: user.subscription?.tier || 'free',
          status: user.subscription?.status || 'active',
          currentPeriodEnd: user.subscription?.currentPeriodEnd,
          cancelAtPeriodEnd: user.subscription?.cancelAtPeriodEnd,
        },
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// POST /auth/connect-onedrive - Store OneDrive tokens for authenticated user
router.post(
  '/connect-onedrive',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { accessToken, refreshToken, expiresAt } = req.body;

      if (!accessToken) {
        res.status(400).json({ error: 'OneDrive access token required' });
        return;
      }

      await prisma.user.update({
        where: { id: req.user!.userId },
        data: {
          onedriveAccessToken: accessToken,
          onedriveRefreshToken: refreshToken || null,
          onedriveExpiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Connect OneDrive error:', error);
      res.status(500).json({ error: 'Failed to connect OneDrive' });
    }
  }
);

// POST /auth/disconnect-onedrive - Remove OneDrive tokens
router.post(
  '/disconnect-onedrive',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await prisma.user.update({
        where: { id: req.user!.userId },
        data: {
          onedriveAccessToken: null,
          onedriveRefreshToken: null,
          onedriveExpiresAt: null,
        },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Disconnect OneDrive error:', error);
      res.status(500).json({ error: 'Failed to disconnect OneDrive' });
    }
  }
);

// PUT /auth/profile - Update user profile
router.put('/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        name: name !== undefined ? name : undefined,
      },
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /auth/change-password - Change password
router.post(
  '/change-password',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Current and new passwords are required' });
        return;
      }

      if (newPassword.length < 8) {
        res.status(400).json({ error: 'New password must be at least 8 characters' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Check if user has a password set
      if (!user.passwordHash) {
        res.status(400).json({ error: 'Cannot change password for OAuth accounts' });
        return;
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValidPassword) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 12);

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  }
);

// ============= GitHub OAuth Routes =============

// POST /auth/github/url - Get GitHub OAuth URL
router.post('/github/url', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { redirectUri } = req.body;

    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      res.status(500).json({ error: 'GitHub OAuth not configured. Add GITHUB_CLIENT_ID to .env' });
      return;
    }

    const state = Buffer.from(JSON.stringify({
      userId: req.user!.userId,
      timestamp: Date.now(),
    })).toString('base64');

    const scopes = ['repo', 'read:user', 'user:email'].join(' ');

    const url = `https://github.com/login/oauth/authorize?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${state}`;

    res.json({ url });
  } catch (error) {
    console.error('GitHub URL error:', error);
    res.status(500).json({ error: 'Failed to generate GitHub auth URL' });
  }
});

// POST /auth/github/connect - Exchange code for token and connect GitHub
router.post('/github/connect', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code required' });
      return;
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      res.status(500).json({ error: 'GitHub OAuth not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env' });
      return;
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };

    if (tokenData.error || !tokenData.access_token) {
      res.status(400).json({ error: tokenData.error_description || 'Failed to get GitHub access token' });
      return;
    }

    // Get GitHub user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github+json',
      },
    });

    const userData = await userResponse.json() as { login: string; id: number };

    if (!userData.login) {
      res.status(400).json({ error: 'Failed to get GitHub user info' });
      return;
    }

    // Store GitHub tokens in database
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        githubAccessToken: tokenData.access_token,
        githubUsername: userData.login,
        githubConnectedAt: new Date(),
      },
    });

    res.json({ username: userData.login });
  } catch (error) {
    console.error('GitHub connect error:', error);
    res.status(500).json({ error: 'Failed to connect GitHub account' });
  }
});

// POST /auth/github/disconnect - Remove GitHub connection
router.post('/github/disconnect', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        githubAccessToken: null,
        githubRefreshToken: null,
        githubUsername: null,
        githubConnectedAt: null,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('GitHub disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect GitHub' });
  }
});

export default router;
