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

export default router;
