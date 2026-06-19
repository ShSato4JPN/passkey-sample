/**
 * 登録（パスキー作成）の Step 1: 登録オプションの生成。
 *
 * フロー:
 *   1. ユーザー名を受け取り、ユーザーを取得 or 作成
 *   2. generateRegistrationOptions で challenge を含むオプションを生成
 *   3. challenge をサーバー側セッションに保存（後で検証するため）
 *   4. オプションをブラウザへ返す → ブラウザは startRegistration に渡す
 */

import { getOrCreateSessionId } from "@/lib/session";
import {
  createUser,
  getCredentialsByUserId,
  getUserByUsername,
  saveChallenge,
} from "@/lib/store";
import { rpID, rpName, userVerification } from "@/lib/webauthn/config";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "不正なリクエストです" },
      { status: 400 },
    );
  }

  const username =
    typeof body === "object" && body !== null && "username" in body
      ? String((body as { username: unknown }).username ?? "").trim()
      : "";

  if (!username) {
    return NextResponse.json({ error: "username は必須です" }, { status: 400 });
  }

  // 既存ユーザーなら再利用し、無ければ作成（同一ユーザーへの複数パスキー登録を許容）
  const user = getUserByUsername(username) ?? createUser(username);

  // 既に登録済みの資格情報は excludeCredentials に渡し、
  // 同じ認証器での二重登録を防ぐ。
  const existingCredentials = getCredentialsByUserId(user.id);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    // ユーザーハンドルは Uint8Array。推測不能な内部IDをエンコードして使う。
    userID: new TextEncoder().encode(user.id),
    userName: user.username,
    // attestation は通常 "none" で十分（プライバシー的にも推奨）。
    // 企業の認証器ポリシー検証が必要な場合のみ "direct" 等を検討する。
    attestationType: "none",
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.id,
      transports: cred.transports,
    })),
    authenticatorSelection: {
      // Discoverable Credential（パスキー）を要求 → ユーザー名なしログインが可能に
      residentKey: "required",
      requireResidentKey: true,
      userVerification,
    },
  });

  // challenge はワンタイム。セッションに紐づけて保存し、verify で照合する。
  const sessionId = await getOrCreateSessionId();
  saveChallenge(sessionId, options.challenge);

  return NextResponse.json(options);
}
