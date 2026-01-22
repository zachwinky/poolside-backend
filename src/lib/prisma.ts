import { PrismaClient } from '@prisma/client';

// Declare a global variable to hold the Prisma Client
declare global {
  var prisma: PrismaClient | undefined;
}

// Create Prisma Client
// For Prisma Postgres (Accelerate), pass accelerateUrl to constructor
const createPrismaClient = () => {
  const accelerateUrl = process.env.PRISMA_DATABASE_URL;

  // Prisma 7 requires accelerateUrl for Prisma Postgres
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    ...(accelerateUrl && { accelerateUrl }),
  } as any);
};

// Create a singleton Prisma Client to prevent multiple instances in development
export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
