/**
 * セッション管理（サンプル簡易版）。
 *
 * 役割は2つ:
 *   1. WebAuthn フロー中の「challenge」をユーザーごとに紐づけるための一時ID
 *      （ログイン前から必要なので未認証でも発行する）
 *   2. 認証成功後の「ログイン済みユーザー」の保持
 *
 * Cookie のセキュリティ属性（重要）:
 *   - httpOnly : JS から読めない → XSS によるセッション窃取を緩和
 *   - secure   : HTTPS のみ送信（本番では必須。localhost 開発時のみ false 許容）
 *   - sameSite : "lax" で CSRF を緩和（WebAuthn のトップレベル遷移には十分）
 *
 * ⚠️ 本番では署名付き/暗号化セッション（iron-session, JWT+検証 等）や
 *    サーバーサイドセッションストアの利用を推奨。ここでは仕組みを示すための簡易実装。
 */

import { cookies } from "next/headers";

const SESSION_COOKIE = "sid";
const USER_COOKIE = "uid";

const isProd = process.env.NODE_ENV === "production";

const baseCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
};

/** フロー追跡用の一時セッションID。無ければ発行する。 */
export async function getOrCreateSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  store.set(SESSION_COOKIE, sessionId, {
    ...baseCookieOptions,
    maxAge: 60 * 60, // 1時間
  });
  return sessionId;
}

export async function getSessionId(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

/** 認証成功後にログイン状態を確立する */
export async function login(userId: string): Promise<void> {
  const store = await cookies();
  store.set(USER_COOKIE, userId, {
    ...baseCookieOptions,
    maxAge: 60 * 60 * 24 * 7, // 7日
  });
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(USER_COOKIE);
  store.delete(SESSION_COOKIE);
}

/** ログイン中のユーザーIDを返す（未ログインなら undefined） */
export async function getCurrentUserId(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(USER_COOKIE)?.value;
}
