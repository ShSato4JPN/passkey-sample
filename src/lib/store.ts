/**
 * ===== サンプル用のインメモリ・データストア =====
 *
 * ⚠️ 本番では絶対にこのまま使わないこと。
 *    プロセス再起動で消える / スケールアウトで共有されない。
 *    実運用では PostgreSQL / DynamoDB / Redis などの永続ストアに置き換える。
 *
 * 保存すべきデータモデル（テーブル設計の参考）:
 *   users        : id, username, ...
 *   credentials  : id(credentialID), userId, publicKey, counter, transports, ...
 *
 * このファイルでは「何を・どう持つか」を型で示すことを目的にしている。
 */

import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
} from "@simplewebauthn/server";

export interface StoredUser {
  /** 内部ユーザーID（ユーザーハンドルとして使う。推測不能なランダム値） */
  id: string;
  /** ログイン名（メールアドレス等）。表示・突合用 */
  username: string;
}

export interface StoredCredential {
  /** 資格情報ID（Base64URL 文字列）。主キー相当でグローバルに一意 */
  id: string;
  /** この資格情報を所有するユーザーID */
  userId: string;
  /** 公開鍵（COSE 形式のバイト列）。署名検証に使う */
  publicKey: Uint8Array<ArrayBuffer>;
  /**
   * 署名カウンター。認証成功のたびに認証器が増やす値。
   * サーバーは保存値より大きいことを確認し、保存値を更新する。
   * 巻き戻り（counter <= 保存値）はクローン認証器の兆候として検知できる。
   */
  counter: number;
  /** 認証器の接続手段（usb, ble, nfc, internal, hybrid 等） */
  transports?: AuthenticatorTransportFuture[];
  /** single-device か multi-device(同期パスキー) か */
  deviceType: CredentialDeviceType;
  /** 認証器がバックアップ済み（クラウド同期済み）か */
  backedUp: boolean;
}

/** challenge は短命なので有効期限付きで保持する */
interface StoredChallenge {
  challenge: string;
  expiresAt: number;
}

const users = new Map<string, StoredUser>();
const credentials = new Map<string, StoredCredential>();
/** セッションID -> 進行中の challenge */
const challenges = new Map<string, StoredChallenge>();

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5分

// ---- Users ----

export function getUserByUsername(username: string): StoredUser | undefined {
  for (const user of users.values()) {
    if (user.username === username) return user;
  }
  return undefined;
}

export function getUserById(id: string): StoredUser | undefined {
  return users.get(id);
}

export function createUser(username: string): StoredUser {
  const user: StoredUser = {
    // ユーザーハンドルは個人情報を含めず、推測不能にする（WebAuthn 仕様の推奨）
    id: crypto.randomUUID(),
    username,
  };
  users.set(user.id, user);
  return user;
}

// ---- Credentials ----

export function getCredentialsByUserId(userId: string): StoredCredential[] {
  return [...credentials.values()].filter((c) => c.userId === userId);
}

export function getCredentialById(id: string): StoredCredential | undefined {
  return credentials.get(id);
}

export function saveCredential(credential: StoredCredential): void {
  credentials.set(credential.id, credential);
}

export function updateCredentialCounter(id: string, newCounter: number): void {
  const credential = credentials.get(id);
  if (credential) credential.counter = newCounter;
}

// ---- Challenges ----

export function saveChallenge(sessionId: string, challenge: string): void {
  challenges.set(sessionId, {
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
}

/**
 * challenge を取得し、即座に削除する（ワンタイム使用を強制）。
 * 期限切れは無効として扱う。
 */
export function consumeChallenge(sessionId: string): string | undefined {
  const entry = challenges.get(sessionId);
  challenges.delete(sessionId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) return undefined;
  return entry.challenge;
}
