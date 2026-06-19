/**
 * ===== データストア（Prisma + PostgreSQL 版）=====
 *
 * インメモリ版と同じ関数シグネチャ（ただし async）を保ち、中身だけ Prisma に
 * 差し替えた実装。API ルート側はこの層越しに DB を触る。
 *
 * 設計メモ:
 *  - publicKey は DB では bytea(Bytes)。Prisma からは Buffer で返るため、
 *    SimpleWebAuthn が期待する Uint8Array に変換して返す。
 *  - counter は DB では BigInt。アプリ内では number(uint32) で扱う。
 *  - challenge はワンタイム + TTL。consumeChallenge で取得即削除する。
 */

import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";

export interface StoredUser {
  id: string;
  username: string;
}

export interface StoredCredential {
  /** 資格情報ID（Base64URL 文字列）。主キー */
  id: string;
  userId: string;
  /** 公開鍵（COSE 形式のバイト列） */
  publicKey: Uint8Array<ArrayBuffer>;
  /** 署名カウンター */
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5分

// ---- Users ----

export async function getUserByUsername(
  username: string,
): Promise<StoredUser | undefined> {
  const user = await prisma.user.findUnique({ where: { username } });
  return user ? { id: user.id, username: user.username } : undefined;
}

export async function getUserById(id: string): Promise<StoredUser | undefined> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? { id: user.id, username: user.username } : undefined;
}

export async function createUser(username: string): Promise<StoredUser> {
  // id は @default(uuid()) で DB 側が採番（推測不能なユーザーハンドル）
  const user = await prisma.user.create({ data: { username } });
  return { id: user.id, username: user.username };
}

// ---- Credentials ----

export async function getCredentialsByUserId(
  userId: string,
): Promise<StoredCredential[]> {
  const rows = await prisma.credential.findMany({ where: { userId } });
  return rows.map(toStoredCredential);
}

export async function getCredentialById(
  id: string,
): Promise<StoredCredential | undefined> {
  const row = await prisma.credential.findUnique({ where: { id } });
  return row ? toStoredCredential(row) : undefined;
}

export async function saveCredential(
  credential: StoredCredential,
): Promise<void> {
  await prisma.credential.create({
    data: {
      id: credential.id,
      userId: credential.userId,
      // Uint8Array -> Buffer(bytea)
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      deviceType: credential.deviceType,
      backedUp: credential.backedUp,
    },
  });
}

export async function updateCredentialCounter(
  id: string,
  newCounter: number,
): Promise<void> {
  await prisma.credential.update({
    where: { id },
    data: { counter: BigInt(newCounter) },
  });
}

/** Prisma の行 -> アプリ内の型へ変換 */
function toStoredCredential(row: {
  id: string;
  userId: string;
  publicKey: Buffer | Uint8Array;
  counter: bigint;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
}): StoredCredential {
  return {
    id: row.id,
    userId: row.userId,
    // bytea(Buffer) -> Uint8Array<ArrayBuffer>
    publicKey: Uint8Array.from(row.publicKey),
    counter: Number(row.counter),
    transports: row.transports as AuthenticatorTransportFuture[],
    deviceType: row.deviceType as CredentialDeviceType,
    backedUp: row.backedUp,
  };
}

// ---- Challenges ----

export async function saveChallenge(
  sessionId: string,
  challenge: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  // 同一セッションの古い challenge は上書き
  await prisma.challenge.upsert({
    where: { sessionId },
    create: { sessionId, challenge, expiresAt },
    update: { challenge, expiresAt },
  });
}

/**
 * challenge を取得し、即座に削除する（ワンタイム使用を強制）。
 * 期限切れは無効として扱う。
 */
export async function consumeChallenge(
  sessionId: string,
): Promise<string | undefined> {
  const entry = await prisma.challenge
    .delete({ where: { sessionId } })
    .catch(() => null); // 無ければ null
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt.getTime()) return undefined;
  return entry.challenge;
}
