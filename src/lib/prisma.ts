/**
 * Prisma クライアントの singleton。
 *
 * Next.js の dev では HMR でモジュールが再評価されるたびに new PrismaClient() が
 * 走り、DB コネクションが枯渇する。globalThis にぶら下げて
 * 「プロセス内で1インスタンス」を保証する（Next.js での定番パターン）。
 *
 * 注意: これは「1プロセス内で共有」であって、サーバーレスで複数インスタンスが
 *       並走する場合はインスタンスごとに別物になる。コネクション数管理は
 *       PgBouncer / Neon のプーリング等で行うこと。
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
