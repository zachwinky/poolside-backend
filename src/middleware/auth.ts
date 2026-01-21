import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

export interface JWTPayload {
  userId: string;
  email: string;
  tier: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

// Verify JWT access token
export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'JWT not configured' });
      return;
    }

    const payload = jwt.verify(token, secret) as JWTPayload;
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    res.status(403).json({ error: 'Invalid token' });
  }
}

// Generate access token (15 min expiry)
export function generateAccessToken(payload: JWTPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');

  return jwt.sign(payload, secret, { expiresIn: '15m' });
}

// Generate refresh token (7 day expiry)
export function generateRefreshToken(payload: JWTPayload): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');

  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

// Verify refresh token
export function verifyRefreshToken(token: string): JWTPayload {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');

  return jwt.verify(token, secret) as JWTPayload;
}

// Optional auth - doesn't fail if no token, but attaches user if valid
export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (token) {
    try {
      const secret = process.env.JWT_SECRET;
      if (secret) {
        const payload = jwt.verify(token, secret) as JWTPayload;
        req.user = payload;
      }
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }

  next();
}
