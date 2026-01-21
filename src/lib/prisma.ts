import { PrismaClient } from '@prisma/client';

// Declare a global variable to hold the Prisma Client
declare global {
  var prisma: PrismaClient | undefined;
}

// Create a singleton Prisma Client to prevent multiple instances in development
export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
