import { PrismaClient } from '@prisma/client';

// Declare a global variable to hold the Prisma Client
declare global {
  var prisma: PrismaClient | undefined;
}

// Create Prisma Client with Accelerate support for Prisma Postgres
const createPrismaClient = () => {
  // Prisma Postgres (Accelerate) URL - required for Prisma 7 with Prisma Postgres
  const accelerateUrl = process.env.PRISMA_DATABASE_URL;

  if (!accelerateUrl) {
    // Log available env vars for debugging (don't log values, just keys)
    console.error('PRISMA_DATABASE_URL is not set!');
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('PRISMA') || k.includes('DATABASE')));
    throw new Error('PRISMA_DATABASE_URL environment variable is required for Prisma Postgres');
  }

  console.log('Initializing Prisma Client with Accelerate');

  // Prisma 7 requires accelerateUrl for Prisma Postgres
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    accelerateUrl,
  } as any);
};

// Create a singleton Prisma Client to prevent multiple instances in development
export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
