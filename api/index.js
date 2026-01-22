const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Lazy-load Prisma to avoid initialization errors
let prisma = null;
function getPrisma() {
  if (!prisma) {
    const { PrismaClient } = require('@prisma/client');
    const accelerateUrl = process.env.PRISMA_DATABASE_URL;

    if (!accelerateUrl) {
      throw new Error('PRISMA_DATABASE_URL is not configured');
    }

    prisma = new PrismaClient({
      log: ['error'],
      accelerateUrl,
    });
  }
  return prisma;
}

// CORS
app.use(cors({ origin: true, credentials: true }));

// Parse JSON
app.use(express.json());

// JWT helpers
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';

function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// Root
app.get('/', (req, res) => {
  res.json({ name: 'Poolside Code API', status: 'running', version: '1.0.0' });
});

// ============ AUTH ROUTES ============

// POST /auth/register
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const db = getPrisma();

    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await db.user.create({
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
      include: { subscription: true },
    });

    const tokenPayload = { userId: user.id, email: user.email, tier: user.subscription?.tier || 'free' };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.subscription,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to create account', details: error.message });
  }
});

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getPrisma();

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { subscription: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user has a password (Google-only users won't)
    if (!user.passwordHash) {
      return res.status(401).json({ error: 'Please sign in with Google' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tokenPayload = { userId: user.id, email: user.email, tier: user.subscription?.tier || 'free' };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.subscription,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login', details: error.message });
  }
});

// POST /auth/refresh
app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const db = getPrisma();

    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      include: { subscription: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const tokenPayload = { userId: user.id, email: user.email, tier: user.subscription?.tier || 'free' };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /auth/google - Google OAuth login/register
app.post('/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    // Verify the Google ID token
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google' });
    }

    const db = getPrisma();

    // Check if user exists
    let user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { subscription: true },
    });

    if (!user) {
      // Create new user
      user = await db.user.create({
        data: {
          email: email.toLowerCase(),
          name: name || null,
          googleId,
          subscription: {
            create: {
              tier: 'free',
              status: 'active',
            },
          },
        },
        include: { subscription: true },
      });
    } else if (!user.googleId) {
      // Link Google account to existing user
      user = await db.user.update({
        where: { id: user.id },
        data: { googleId },
        include: { subscription: true },
      });
    }

    const tokenPayload = { userId: user.id, email: user.email, tier: user.subscription?.tier || 'free' };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.subscription,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: 'Google authentication failed', details: error.message });
  }
});

// GET /auth/me
app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const db = getPrisma();

    const user = await db.user.findUnique({
      where: { id: req.user.userId },
      include: { subscription: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      subscription: user.subscription,
      hasOnedrive: !!user.onedriveAccessToken,
      hasPassword: !!user.passwordHash,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user', details: error.message });
  }
});

// PATCH /auth/me - Update user profile
app.patch('/auth/me', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const db = getPrisma();

    const user = await db.user.update({
      where: { id: req.user.userId },
      data: { name: name || null },
      include: { subscription: true },
    });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      subscription: user.subscription,
      hasOnedrive: !!user.onedriveAccessToken,
      hasPassword: !!user.passwordHash,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile', details: error.message });
  }
});

// POST /auth/change-password - Change password
app.post('/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const db = getPrisma();
    const user = await db.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If user has a password, verify current password
    if (user.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password', details: error.message });
  }
});

// POST /stripe/portal - Create Stripe customer portal session
app.post('/stripe/portal', authenticateToken, async (req, res) => {
  try {
    const db = getPrisma();
    const user = await db.user.findUnique({
      where: { id: req.user.userId },
      include: { subscription: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.subscription?.stripeCustomerId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    const { returnUrl } = req.body;
    const session = await stripe.billingPortal.sessions.create({
      customer: user.subscription.stripeCustomerId,
      return_url: returnUrl || 'https://poolside.akoolai.com/dashboard/subscription',
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe portal error:', error);
    res.status(500).json({ error: 'Failed to create portal session', details: error.message });
  }
});

// ============ STRIPE WEBHOOK ============

// POST /webhooks/stripe/subscription - Update subscription from Stripe webhook
app.post('/webhooks/stripe/subscription', async (req, res) => {
  try {
    // Verify internal webhook secret
    const webhookSecret = req.headers['x-webhook-secret'];
    if (webhookSecret !== process.env.INTERNAL_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const { userId, tier, stripeCustomerId, stripeSubscriptionId, status, cancelAtPeriodEnd } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const db = getPrisma();

    // Update or create subscription
    const subscription = await db.subscription.upsert({
      where: { userId },
      update: {
        ...(tier && { tier }),
        ...(status && { status }),
        ...(stripeCustomerId && { stripeCustomerId }),
        ...(stripeSubscriptionId !== undefined && { stripeSubscriptionId }),
        ...(cancelAtPeriodEnd !== undefined && { cancelAtPeriodEnd }),
      },
      create: {
        userId,
        tier: tier || 'free',
        status: status || 'active',
        stripeCustomerId,
        stripeSubscriptionId,
      },
    });

    res.json({ success: true, subscription });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(500).json({ error: 'Failed to update subscription', details: error.message });
  }
});

// 404 handler - use middleware instead of wildcard route (Express 5 compatibility)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

module.exports = app;
