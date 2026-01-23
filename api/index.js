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

// POST /auth/apple - Apple Sign In login/register
app.post('/auth/apple', async (req, res) => {
  try {
    const { identityToken, email, fullName } = req.body;

    if (!identityToken) {
      return res.status(400).json({ error: 'Apple identity token is required' });
    }

    // Decode and verify the Apple identity token
    // Apple tokens are JWTs signed by Apple's public key
    const decodedToken = jwt.decode(identityToken, { complete: true });

    if (!decodedToken || !decodedToken.payload) {
      return res.status(400).json({ error: 'Invalid Apple identity token' });
    }

    const { sub: appleId, email: tokenEmail } = decodedToken.payload;

    // Use email from token or request (Apple only sends email on first sign-in)
    const userEmail = tokenEmail || email;

    if (!appleId) {
      return res.status(400).json({ error: 'Apple user ID not found in token' });
    }

    const db = getPrisma();

    // First, try to find user by Apple ID
    let user = await db.user.findFirst({
      where: { appleId },
      include: { subscription: true },
    });

    if (!user && userEmail) {
      // Check if user exists with this email
      user = await db.user.findUnique({
        where: { email: userEmail.toLowerCase() },
        include: { subscription: true },
      });

      if (user) {
        // Link Apple account to existing user
        user = await db.user.update({
          where: { id: user.id },
          data: { appleId },
          include: { subscription: true },
        });
      }
    }

    if (!user) {
      // Create new user
      const userName = fullName
        ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
        : null;

      user = await db.user.create({
        data: {
          email: userEmail ? userEmail.toLowerCase() : `apple_${appleId}@private.appleid.com`,
          name: userName,
          appleId,
          subscription: {
            create: {
              tier: 'free',
              status: 'active',
            },
          },
        },
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
    console.error('Apple auth error:', error);
    res.status(401).json({ error: 'Apple authentication failed', details: error.message });
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
      hasGithub: !!user.githubAccessToken,
      githubUsername: user.githubUsername,
      hasPassword: !!user.passwordHash,
      isAdmin: user.isAdmin,
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
      isAdmin: user.isAdmin,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile', details: error.message });
  }
});

// ============ ONEDRIVE ROUTES ============

// POST /auth/onedrive/url - Get Microsoft OAuth URL
app.post('/auth/onedrive/url', authenticateToken, async (req, res) => {
  try {
    const { redirectUri } = req.body;

    if (!redirectUri) {
      return res.status(400).json({ error: 'Redirect URI is required' });
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: 'Microsoft OAuth not configured' });
    }

    const scopes = [
      'openid',
      'profile',
      'email',
      'Files.ReadWrite.All',
      'offline_access',
    ].join(' ');

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&response_mode=query`;

    res.json({ url: authUrl });
  } catch (error) {
    console.error('OneDrive auth URL error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL', details: error.message });
  }
});

// POST /auth/onedrive/connect - Exchange code for tokens and store
app.post('/auth/onedrive/connect', authenticateToken, async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code || !redirectUri) {
      return res.status(400).json({ error: 'Code and redirect URI are required' });
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Microsoft OAuth not configured' });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Microsoft token error:', tokenData);
      return res.status(400).json({ error: 'Failed to exchange code for tokens' });
    }

    const db = getPrisma();

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store tokens
    await db.user.update({
      where: { id: req.user.userId },
      data: {
        onedriveAccessToken: tokenData.access_token,
        onedriveRefreshToken: tokenData.refresh_token,
        onedriveExpiresAt: expiresAt,
      },
    });

    res.json({ message: 'OneDrive connected successfully' });
  } catch (error) {
    console.error('OneDrive connect error:', error);
    res.status(500).json({ error: 'Failed to connect OneDrive', details: error.message });
  }
});

// POST /auth/onedrive/disconnect - Remove OneDrive tokens
app.post('/auth/onedrive/disconnect', authenticateToken, async (req, res) => {
  try {
    const db = getPrisma();

    await db.user.update({
      where: { id: req.user.userId },
      data: {
        onedriveAccessToken: null,
        onedriveRefreshToken: null,
        onedriveExpiresAt: null,
      },
    });

    res.json({ message: 'OneDrive disconnected successfully' });
  } catch (error) {
    console.error('OneDrive disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect OneDrive', details: error.message });
  }
});

// ============ GITHUB ROUTES ============

// POST /auth/github/url - Get GitHub OAuth URL
app.post('/auth/github/url', authenticateToken, async (req, res) => {
  try {
    const { redirectUri } = req.body;

    if (!redirectUri) {
      return res.status(400).json({ error: 'Redirect URI is required' });
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: 'GitHub OAuth not configured' });
    }

    const scopes = 'repo user:email';

    const authUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${req.user.userId}`;

    res.json({ url: authUrl });
  } catch (error) {
    console.error('GitHub auth URL error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL', details: error.message });
  }
});

// POST /auth/github/connect - Exchange code for tokens and store
app.post('/auth/github/connect', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'GitHub OAuth not configured' });
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('GitHub token error:', tokenData);
      return res.status(400).json({ error: tokenData.error_description || 'Failed to exchange code for token' });
    }

    // Get GitHub user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const githubUser = await userResponse.json();

    const db = getPrisma();

    // Store GitHub tokens
    await db.user.update({
      where: { id: req.user.userId },
      data: {
        githubAccessToken: tokenData.access_token,
        githubRefreshToken: tokenData.refresh_token || null,
        githubUsername: githubUser.login,
        githubConnectedAt: new Date(),
      },
    });

    res.json({
      message: 'GitHub connected successfully',
      username: githubUser.login,
    });
  } catch (error) {
    console.error('GitHub connect error:', error);
    res.status(500).json({ error: 'Failed to connect GitHub', details: error.message });
  }
});

// POST /auth/github/disconnect - Remove GitHub tokens
app.post('/auth/github/disconnect', authenticateToken, async (req, res) => {
  try {
    const db = getPrisma();

    await db.user.update({
      where: { id: req.user.userId },
      data: {
        githubAccessToken: null,
        githubRefreshToken: null,
        githubUsername: null,
        githubConnectedAt: null,
      },
    });

    res.json({ message: 'GitHub disconnected successfully' });
  } catch (error) {
    console.error('GitHub disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect GitHub', details: error.message });
  }
});

// GET /api/github/repos - List user's repositories
app.get('/api/github/repos', authenticateToken, async (req, res) => {
  try {
    const db = getPrisma();
    const user = await db.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user?.githubAccessToken) {
      return res.status(400).json({ error: 'GitHub not connected' });
    }

    const { page = 1, per_page = 30, sort = 'updated' } = req.query;

    const response = await fetch(
      `https://api.github.com/user/repos?page=${page}&per_page=${per_page}&sort=${sort}&affiliation=owner,collaborator`,
      {
        headers: {
          'Authorization': `Bearer ${user.githubAccessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.message || 'Failed to fetch repos' });
    }

    const repos = await response.json();

    res.json({
      repos: repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
        description: repo.description,
        defaultBranch: repo.default_branch,
        updatedAt: repo.updated_at,
        language: repo.language,
      })),
    });
  } catch (error) {
    console.error('GitHub repos error:', error);
    res.status(500).json({ error: 'Failed to fetch repositories', details: error.message });
  }
});

// GET /api/github/tree - Get repository file tree
app.get('/api/github/tree', authenticateToken, async (req, res) => {
  try {
    const { owner, repo, ref = 'HEAD' } = req.query;

    if (!owner || !repo) {
      return res.status(400).json({ error: 'Owner and repo are required' });
    }

    const db = getPrisma();
    const user = await db.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user?.githubAccessToken) {
      return res.status(400).json({ error: 'GitHub not connected' });
    }

    // Get the tree recursively
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
      {
        headers: {
          'Authorization': `Bearer ${user.githubAccessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.message || 'Failed to fetch tree' });
    }

    const data = await response.json();

    res.json({
      sha: data.sha,
      tree: data.tree.map(item => ({
        path: item.path,
        type: item.type, // 'blob' for files, 'tree' for directories
        sha: item.sha,
        size: item.size,
      })),
      truncated: data.truncated,
    });
  } catch (error) {
    console.error('GitHub tree error:', error);
    res.status(500).json({ error: 'Failed to fetch file tree', details: error.message });
  }
});

// GET /api/github/file - Get file content
app.get('/api/github/file', authenticateToken, async (req, res) => {
  try {
    const { owner, repo, path, ref = 'HEAD' } = req.query;

    if (!owner || !repo || !path) {
      return res.status(400).json({ error: 'Owner, repo, and path are required' });
    }

    const db = getPrisma();
    const user = await db.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user?.githubAccessToken) {
      return res.status(400).json({ error: 'GitHub not connected' });
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`,
      {
        headers: {
          'Authorization': `Bearer ${user.githubAccessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.message || 'Failed to fetch file' });
    }

    const data = await response.json();

    // Decode base64 content
    const content = data.encoding === 'base64'
      ? Buffer.from(data.content, 'base64').toString('utf-8')
      : data.content;

    res.json({
      path: data.path,
      sha: data.sha,
      size: data.size,
      content,
    });
  } catch (error) {
    console.error('GitHub file error:', error);
    res.status(500).json({ error: 'Failed to fetch file', details: error.message });
  }
});

// POST /api/github/commit - Commit file changes
app.post('/api/github/commit', authenticateToken, async (req, res) => {
  try {
    const { owner, repo, branch, message, files } = req.body;

    if (!owner || !repo || !branch || !message || !files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Owner, repo, branch, message, and files are required' });
    }

    const db = getPrisma();
    const user = await db.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user?.githubAccessToken) {
      return res.status(400).json({ error: 'GitHub not connected' });
    }

    const headers = {
      'Authorization': `Bearer ${user.githubAccessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    };

    // 1. Get the current commit SHA for the branch
    const refResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      { headers }
    );

    if (!refResponse.ok) {
      const error = await refResponse.json();
      return res.status(refResponse.status).json({ error: error.message || 'Failed to get branch ref' });
    }

    const refData = await refResponse.json();
    const currentCommitSha = refData.object.sha;

    // 2. Get the current tree SHA
    const commitResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${currentCommitSha}`,
      { headers }
    );

    const commitData = await commitResponse.json();
    const currentTreeSha = commitData.tree.sha;

    // 3. Create blobs for each file
    const treeItems = [];
    for (const file of files) {
      if (file.action === 'delete') {
        // For deletions, we don't add to tree (effectively removes it)
        continue;
      }

      // Create a blob for the file content
      const blobResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: file.content,
            encoding: 'utf-8',
          }),
        }
      );

      const blobData = await blobResponse.json();

      treeItems.push({
        path: file.path.startsWith('/') ? file.path.slice(1) : file.path,
        mode: '100644', // Regular file
        type: 'blob',
        sha: blobData.sha,
      });
    }

    // 4. Create new tree
    const newTreeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_tree: currentTreeSha,
          tree: treeItems,
        }),
      }
    );

    const newTreeData = await newTreeResponse.json();

    // 5. Create the commit
    const newCommitResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          tree: newTreeData.sha,
          parents: [currentCommitSha],
        }),
      }
    );

    const newCommitData = await newCommitResponse.json();

    // 6. Update the branch reference
    const updateRefResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sha: newCommitData.sha,
        }),
      }
    );

    if (!updateRefResponse.ok) {
      const error = await updateRefResponse.json();
      return res.status(updateRefResponse.status).json({ error: error.message || 'Failed to update branch' });
    }

    res.json({
      success: true,
      commit: {
        sha: newCommitData.sha,
        message: newCommitData.message,
        url: newCommitData.html_url,
      },
    });
  } catch (error) {
    console.error('GitHub commit error:', error);
    res.status(500).json({ error: 'Failed to create commit', details: error.message });
  }
});

// GET /api/github/branches - List repository branches
app.get('/api/github/branches', authenticateToken, async (req, res) => {
  try {
    const { owner, repo } = req.query;

    if (!owner || !repo) {
      return res.status(400).json({ error: 'Owner and repo are required' });
    }

    const db = getPrisma();
    const user = await db.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user?.githubAccessToken) {
      return res.status(400).json({ error: 'GitHub not connected' });
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      {
        headers: {
          'Authorization': `Bearer ${user.githubAccessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.message || 'Failed to fetch branches' });
    }

    const branches = await response.json();

    res.json({
      branches: branches.map(branch => ({
        name: branch.name,
        sha: branch.commit.sha,
        protected: branch.protected,
      })),
    });
  } catch (error) {
    console.error('GitHub branches error:', error);
    res.status(500).json({ error: 'Failed to fetch branches', details: error.message });
  }
});

// ============ PASSWORD RESET ROUTES ============

// POST /auth/forgot-password - Send password reset email
app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const db = getPrisma();
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account exists, a reset email has been sent' });
    }

    // Generate reset token (valid for 1 hour)
    const resetToken = jwt.sign(
      { userId: user.id, purpose: 'password-reset' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // TODO: Send email with reset link
    // For now, log it (in production, use a proper email service)
    const resetUrl = `https://poolside.akoolai.com/reset-password?token=${resetToken}`;
    console.log(`Password reset requested for ${email}. Reset URL: ${resetUrl}`);

    // In production, you'd send an email here using nodemailer/resend/sendgrid
    // await sendEmail({
    //   to: email,
    //   subject: 'Reset your Poolside Code password',
    //   html: `Click here to reset: ${resetUrl}`
    // });

    res.json({ message: 'If an account exists, a reset email has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /auth/reset-password - Reset password with token
app.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.purpose !== 'password-reset') {
        throw new Error('Invalid token purpose');
      }
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const db = getPrisma();
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
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

// POST /stripe/checkout - Create Stripe checkout session for new subscription
app.post('/stripe/checkout', authenticateToken, async (req, res) => {
  try {
    const { priceId, returnUrl } = req.body;
    const db = getPrisma();

    if (!priceId) {
      return res.status(400).json({ error: 'Price ID is required' });
    }

    const user = await db.user.findUnique({
      where: { id: req.user.userId },
      include: { subscription: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Create or retrieve Stripe customer
    let customerId = user.subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;

      // Save customer ID
      await db.subscription.upsert({
        where: { userId: user.id },
        update: { stripeCustomerId: customerId },
        create: {
          userId: user.id,
          tier: 'free',
          status: 'active',
          stripeCustomerId: customerId,
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: returnUrl || 'https://poolside.akoolai.com/dashboard/subscription?success=true',
      cancel_url: returnUrl || 'https://poolside.akoolai.com/dashboard/subscription?cancelled=true',
      metadata: { userId: user.id },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session', details: error.message });
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

// ============ ADMIN SETUP ============

// POST /admin/setup - One-time setup to make initial admin (requires secret)
app.post('/admin/setup', async (req, res) => {
  try {
    const { email, secret } = req.body;

    // Use JWT_SECRET as the setup secret for security
    if (secret !== process.env.JWT_SECRET) {
      return res.status(403).json({ error: 'Invalid setup secret' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const db = getPrisma();

    const user = await db.user.update({
      where: { email: email.toLowerCase() },
      data: { isAdmin: true },
    });

    res.json({
      message: 'Admin access granted',
      user: {
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error('Admin setup error:', error);
    res.status(500).json({ error: 'Failed to setup admin', details: error.message });
  }
});

// ============ ADMIN ROUTES ============

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const db = getPrisma();
  db.user.findUnique({
    where: { id: req.user.userId },
  }).then(user => {
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  }).catch(error => {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Failed to verify admin status' });
  });
}

// GET /admin/users - List all users (admin only)
app.get('/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getPrisma();

    const users = await db.user.findMany({
      include: { subscription: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        isAdmin: user.isAdmin,
        subscription: user.subscription,
      })),
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users', details: error.message });
  }
});

// PATCH /admin/users/:userId - Update user (admin only)
app.patch('/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { isAdmin } = req.body;
    const db = getPrisma();

    const user = await db.user.update({
      where: { id: userId },
      data: { isAdmin: !!isAdmin },
      include: { subscription: true },
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        isAdmin: user.isAdmin,
        subscription: user.subscription,
      },
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user', details: error.message });
  }
});

// PATCH /admin/users/:userId/subscription - Update user subscription (admin only)
app.patch('/admin/users/:userId/subscription', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { tier } = req.body;
    const db = getPrisma();

    if (!['free', 'pro', 'unlimited'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be free, pro, or unlimited' });
    }

    // Update or create subscription
    await db.subscription.upsert({
      where: { userId },
      update: { tier },
      create: {
        userId,
        tier,
        status: 'active',
      },
    });

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        isAdmin: user.isAdmin,
        subscription: user.subscription,
      },
    });
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Failed to update subscription', details: error.message });
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

// ============ CHAT ROUTES ============

// Anthropic API configuration
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODELS = {
  haiku: 'claude-3-5-haiku-20241022',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-5-20251101',
};

// Tool definitions for file reading
const FILE_TOOLS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the project.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative path to the file within the project',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for files in the project that match a pattern.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - filename pattern or text to search',
        },
      },
      required: ['query'],
    },
  },
];

const SYSTEM_PROMPT = `You are an AI coding assistant integrated into "Poolside Code", a mobile app that lets users edit code through conversation. You help users modify their code projects stored in OneDrive or GitHub.

CRITICAL INSTRUCTIONS:

1. FILE READING: You have tools to read files from the project.
   - Use read_file to examine actual file contents BEFORE making changes
   - Use search_files to find files when you're not sure of the exact path
   - ALWAYS read a file before modifying it - never guess at its contents

2. FILE CHANGES FORMAT - THIS IS REQUIRED:
   When making ANY code changes, you MUST include this exact JSON block at the END of your response:

   ---FILE_CHANGES_START---
   {"changes": [{"path": "relative/path/to/file.ts", "action": "modify", "content": "COMPLETE file content here"}]}
   ---FILE_CHANGES_END---

   - action must be: "create", "modify", or "delete"
   - content must be the COMPLETE file content (not a diff or partial)
   - path should be relative to project root (e.g., "src/App.tsx" not "/src/App.tsx")
   - You MUST include this block whenever you suggest code changes - without it, changes cannot be applied!

3. Keep explanations concise since users are on mobile devices.

4. Respect the project context - follow existing coding conventions and patterns.

REMEMBER: If you suggest code changes but don't include the ---FILE_CHANGES_START--- block, the user cannot apply them!`;

// Helper to fetch file from OneDrive
async function getOneDriveFile(accessToken, path) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:${path}:/content`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${path}`);
  }
  return response.text();
}

// Helper to fetch file from GitHub
async function getGitHubFile(accessToken, owner, repo, path, ref = 'HEAD') {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${path}`);
  }
  const data = await response.json();
  return data.encoding === 'base64'
    ? Buffer.from(data.content, 'base64').toString('utf-8')
    : data.content;
}

// Execute tool call
async function executeToolCall(toolName, toolInput, storageType, storageToken, projectPath, github, fileList) {
  console.log('Executing tool:', toolName, 'with input:', toolInput);
  console.log('Storage config:', { storageType, projectPath, fileListCount: fileList?.length || 0 });

  try {
    if (toolName === 'read_file') {
      const path = toolInput.path;

      if (storageType === 'onedrive') {
        const fullPath = projectPath === '/' ? `/${path}` : `${projectPath}/${path}`;
        const content = await getOneDriveFile(storageToken, fullPath);
        return `File: ${path}\n\n${content}`;
      } else if (storageType === 'github' && github) {
        const content = await getGitHubFile(storageToken, github.owner, github.repo, path, github.branch);
        return `File: ${path}\n\n${content}`;
      }
      return 'Error: Unknown storage type';
    }

    if (toolName === 'search_files') {
      const query = toolInput.query.toLowerCase();
      const files = fileList || [];

      console.log('search_files: query=', query, 'fileList length=', files.length);
      if (files.length > 0) {
        console.log('First 5 files:', files.slice(0, 5));
      }

      const isGlob = query.includes('*');
      let matches;

      if (isGlob) {
        const regexPattern = query.replace(/\./g, '\\.').replace(/\*/g, '.*');
        const regex = new RegExp(regexPattern);
        matches = files.filter(f => regex.test(f.toLowerCase()));
      } else {
        matches = files.filter(f => f.toLowerCase().includes(query));
      }

      console.log('search_files: found', matches.length, 'matches');

      if (matches.length === 0) {
        return `No files found matching "${query}". The project has ${files.length} indexed files.`;
      }

      return `Found ${matches.length} file(s) matching "${query}":\n${matches.slice(0, 50).join('\n')}${matches.length > 50 ? `\n... and ${matches.length - 50} more` : ''}`;
    }

    return `Unknown tool: ${toolName}`;
  } catch (error) {
    return `Error executing ${toolName}: ${error.message}`;
  }
}

// Parse file changes from response
function parseFileChanges(content) {
  // Try the standard format first
  const match = content.match(/---FILE_CHANGES_START---([\s\S]*?)---FILE_CHANGES_END---/);
  if (match) {
    try {
      const jsonStr = match[1].trim();
      console.log('Found FILE_CHANGES block, parsing JSON...');
      const json = JSON.parse(jsonStr);
      const changes = json.changes || [];
      console.log(`Parsed ${changes.length} file change(s)`);
      return changes;
    } catch (e) {
      console.error('Failed to parse FILE_CHANGES JSON:', e.message);
      // Try to extract just the array if the wrapper object failed
      try {
        const arrayMatch = match[1].match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          const changes = JSON.parse(arrayMatch[0]);
          console.log(`Parsed ${changes.length} file change(s) from array`);
          return changes;
        }
      } catch (e2) {
        console.error('Failed to parse as array:', e2.message);
      }
    }
  }

  console.log('No FILE_CHANGES block found in response');
  return [];
}

// POST /api/chat/with-tools - Chat with tool use support
app.post('/api/chat/with-tools', async (req, res) => {
  try {
    const {
      messages,
      context,
      model = 'sonnet',
      apiKey,
      enableTools = false,
      storageType,
      storageToken,
      projectPath = '/',
      github,
      fileList,
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Use provided API key or fall back to server's key
    const anthropicKey = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    const modelId = MODELS[model] || MODELS.sonnet;
    const systemMessage = `${SYSTEM_PROMPT}\n\n---PROJECT CONTEXT---\n${context || ''}\n---END CONTEXT---`;

    let apiMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const MAX_ITERATIONS = 5;
    let iterations = 0;
    let finalContent = '';
    let allFileChanges = [];

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const requestBody = {
        model: modelId,
        max_tokens: 4096,
        system: systemMessage,
        messages: apiMessages,
      };

      // Only include tools if enabled and we have storage config
      if (enableTools && storageToken) {
        requestBody.tools = FILE_TOOLS;
      }

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (response.status === 401) {
          return res.status(401).json({ error: 'Invalid API key' });
        }
        if (response.status === 429) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }
        return res.status(response.status).json({ error: error.error?.message || 'Chat request failed' });
      }

      const data = await response.json();

      // Extract text content
      const textBlocks = data.content.filter(block => block.type === 'text');
      const textContent = textBlocks.map(block => block.text).join('');
      finalContent = textContent;

      // Parse file changes
      const fileChanges = parseFileChanges(textContent);
      if (fileChanges.length > 0) {
        allFileChanges = [...allFileChanges, ...fileChanges];
      }

      // Check for tool use
      const toolUseBlocks = data.content.filter(block => block.type === 'tool_use');

      if (data.stop_reason === 'tool_use' && toolUseBlocks.length > 0 && storageToken) {
        // Execute tool calls
        const toolResults = [];

        for (const toolUse of toolUseBlocks) {
          const result = await executeToolCall(
            toolUse.name,
            toolUse.input,
            storageType,
            storageToken,
            projectPath,
            github,
            fileList
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        // Add assistant response and tool results to messages
        apiMessages = [
          ...apiMessages,
          { role: 'assistant', content: data.content },
          { role: 'user', content: toolResults },
        ];

        continue;
      }

      // No more tool calls, we're done
      break;
    }

    // Clean the content
    const cleanedContent = finalContent
      .replace(/---FILE_CHANGES_START---[\s\S]*?---FILE_CHANGES_END---/g, '')
      .trim();

    res.json({
      content: cleanedContent,
      fileChanges: allFileChanges,
      iterations,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Chat request failed', details: error.message });
  }
});

// POST /api/chat - Simple chat without tools (backwards compatibility)
app.post('/api/chat', async (req, res) => {
  req.body.enableTools = false;
  return app._router.handle(req, res, () => {});
});

// ============ PURCHASE VALIDATION ============

// POST /api/validate-purchase - Validate IAP receipt and update subscription
app.post('/api/validate-purchase', authenticateToken, async (req, res) => {
  try {
    const { productId, receipt, platform } = req.body;

    if (!productId || !receipt) {
      return res.status(400).json({ error: 'productId and receipt are required' });
    }

    // Determine tier from product ID
    let tier = 'free';
    if (productId.includes('unlimited')) {
      tier = 'unlimited';
    } else if (productId.includes('pro')) {
      tier = 'pro';
    }

    // TODO: In production, verify receipt with Apple/Google servers
    // For now, trust the receipt since Apple/Google already validated it

    const db = getPrisma();

    // Update or create subscription
    await db.subscription.upsert({
      where: { userId: req.user.id },
      update: {
        tier,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
      create: {
        userId: req.user.id,
        tier,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    console.log(`Purchase validated for user ${req.user.id}: ${tier} (${platform})`);

    res.json({ valid: true, tier });
  } catch (error) {
    console.error('Purchase validation error:', error);
    res.status(500).json({ error: 'Failed to validate purchase', details: error.message });
  }
});

// ============ LEGAL PAGES ============

const PRIVACY_POLICY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Poolside Code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #e0e0e0; }
    h1 { color: #0078D4; }
    h2 { color: #4CAF50; margin-top: 30px; }
    a { color: #0078D4; }
    ul { padding-left: 20px; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p><strong>Last Updated: January 2025</strong></p>

  <h2>Introduction</h2>
  <p>Poolside Code ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.</p>

  <h2>Information We Collect</h2>
  <h3>Information You Provide</h3>
  <ul>
    <li><strong>Account Information</strong>: Email address, name, and password (encrypted)</li>
    <li><strong>Authentication Data</strong>: Profile information from Google, GitHub, or Microsoft if you sign in with those services</li>
    <li><strong>API Keys</strong>: If you use BYOK, your API key is stored securely on your device only</li>
    <li><strong>Project Data</strong>: Information about projects you work on, including file paths and context</li>
  </ul>

  <h3>Information Collected Automatically</h3>
  <ul>
    <li><strong>Usage Data</strong>: Features accessed and requests made</li>
    <li><strong>Device Information</strong>: Device type, operating system, and app version</li>
  </ul>

  <h2>Third-Party Services</h2>
  <p>We integrate with:</p>
  <ul>
    <li><strong>Microsoft OneDrive</strong>: To access and edit your files</li>
    <li><strong>GitHub</strong>: To access and edit your repositories</li>
    <li><strong>Anthropic Claude API</strong>: To provide AI-powered code assistance</li>
    <li><strong>Google Sign-In</strong>: For authentication</li>
    <li><strong>Apple App Store / Google Play</strong>: For subscription management</li>
  </ul>

  <h2>How We Use Your Information</h2>
  <ul>
    <li>Provide, maintain, and improve the app</li>
    <li>Process transactions and manage subscriptions</li>
    <li>Send technical notices and support messages</li>
    <li>Respond to comments and questions</li>
    <li>Analyze usage patterns to improve user experience</li>
  </ul>

  <h2>Data Storage and Security</h2>
  <ul>
    <li>Authentication tokens are stored locally on your device</li>
    <li>Account data is stored securely using industry-standard encryption</li>
    <li>Your code files remain in your OneDrive or GitHub account</li>
    <li>We use HTTPS for all data transmission</li>
  </ul>

  <h2>Data Sharing</h2>
  <p>We do not sell your personal information. We may share information:</p>
  <ul>
    <li><strong>With Service Providers</strong>: To help operate the app</li>
    <li><strong>With Anthropic</strong>: Code snippets are sent for AI processing</li>
    <li><strong>For Legal Reasons</strong>: If required by law</li>
  </ul>

  <h2>Your Rights</h2>
  <p>You have the right to access, correct, or delete your personal information. Contact us at support@akoolai.com.</p>

  <h2>Contact Us</h2>
  <p>Email: support@akoolai.com<br>Website: <a href="https://poolside.akoolai.com">poolside.akoolai.com</a></p>
</body>
</html>`;

const TERMS_OF_SERVICE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service - Poolside Code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #e0e0e0; }
    h1 { color: #0078D4; }
    h2 { color: #4CAF50; margin-top: 30px; }
    h3 { color: #9C27B0; }
    a { color: #0078D4; }
    ul { padding-left: 20px; }
  </style>
</head>
<body>
  <h1>Terms of Service</h1>
  <p><strong>Last Updated: January 2025</strong></p>

  <h2>Agreement to Terms</h2>
  <p>By using Poolside Code ("the App"), you agree to these Terms of Service. If you do not agree, do not use the App.</p>

  <h2>Description of Service</h2>
  <p>Poolside Code is an AI-powered mobile code editor that allows you to browse and edit code from Microsoft OneDrive and GitHub, get AI-powered coding assistance, and manage projects from your mobile device.</p>

  <h2>Account Registration</h2>
  <p>You agree to provide accurate information, maintain security of your credentials, and be responsible for all activities under your account.</p>

  <h2>Subscription Plans</h2>
  <h3>Free Plan</h3>
  <p>10 AI requests per month, Haiku model only</p>

  <h3>Pro Plan ($6.99/month)</h3>
  <p>150 AI requests per month, Haiku + Sonnet models, BYOK support</p>

  <h3>Unlimited Plan ($14.99/month)</h3>
  <p>Unlimited AI requests, all models, BYOK support</p>

  <h3>Billing</h3>
  <ul>
    <li>Subscriptions are billed monthly through Apple App Store or Google Play</li>
    <li>Subscriptions automatically renew unless canceled 24 hours before period end</li>
    <li>Manage subscriptions through your device's app store settings</li>
  </ul>

  <h2>Acceptable Use</h2>
  <p>You agree NOT to: use the App for illegal purposes, upload malicious code, attempt unauthorized access, infringe intellectual property, share credentials, generate harmful content, circumvent limits, or reverse engineer the App.</p>

  <h2>Intellectual Property</h2>
  <p>The App is owned by Akool AI. Your code files remain your property.</p>

  <h2>Third-Party Services</h2>
  <p>The App integrates with Microsoft OneDrive, GitHub, Anthropic Claude, and Google Sign-In, each subject to their own terms.</p>

  <h2>Disclaimer of Warranties</h2>
  <p>THE APP IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. AI-generated code may contain errors - always review and test before production use.</p>

  <h2>Limitation of Liability</h2>
  <p>We are not liable for indirect, incidental, or consequential damages, or damages exceeding amount paid in the past 12 months.</p>

  <h2>Changes to Terms</h2>
  <p>We may modify these Terms at any time. Continued use constitutes acceptance.</p>

  <h2>Contact Us</h2>
  <p>Email: support@akoolai.com<br>Website: <a href="https://poolside.akoolai.com">poolside.akoolai.com</a></p>

  <h2>Apple App Store Terms</h2>
  <p>If downloaded from Apple App Store: These Terms are between you and Akool AI, not Apple. Apple has no obligation to provide maintenance, support, or handle claims.</p>
</body>
</html>`;

// GET /privacy - Privacy Policy page
app.get('/privacy', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(PRIVACY_POLICY_HTML);
});

// GET /terms - Terms of Service page
app.get('/terms', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(TERMS_OF_SERVICE_HTML);
});

// GET /support - Support redirect
app.get('/support', (req, res) => {
  res.redirect('mailto:support@akoolai.com');
});

// 404 handler - use middleware instead of wildcard route (Express 5 compatibility)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

module.exports = app;
