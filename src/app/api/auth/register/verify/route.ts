/**
 * 登録（パスキー作成）の Step 2: ブラウザからの応答を検証して保存。
 *
 * フロー:
 *   1. ブラウザが startRegistration で得た response を受け取る
 *   2. 保存しておいた challenge を取り出す（ワンタイム消費）
 *   3. verifyRegistrationResponse で
 *        - challenge 一致
 *        - origin 一致（フィッシング対策）
 *        - rpID 一致
 *        - 署名/構造の正当性
 *      を検証
 *   4. 検証OKなら公開鍵・counter 等を保存
 */

import { NextResponse } from "next/server";
import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { expectedOrigin, rpID } from "@/lib/webauthn/config";
import {
  consumeChallenge,
  getUserByUsername,
  saveCredential,
} from "@/lib/store";
import { getSessionId, login } from "@/lib/session";

export async function POST(request: Request) {
  let body: { username?: string; response?: RegistrationResponseJSON };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const response = body.response;
  if (!username || !response) {
    return NextResponse.json(
      { error: "username と response は必須です" },
      { status: 400 },
    );
  }

  const user = await getUserByUsername(username);
  if (!user) {
    return NextResponse.json({ error: "ユーザーが存在しません" }, { status: 400 });
  }

  const sessionId = await getSessionId();
  const expectedChallenge = sessionId
    ? await consumeChallenge(sessionId)
    : undefined;
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "challenge が無効または期限切れです。やり直してください。" },
      { status: 400 },
    );
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      // 登録時もユーザー検証（生体/PIN）を要求
      requireUserVerification: true,
    });
  } catch (error) {
    console.error("登録検証エラー:", error);
    const detail =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? `: ${error.message}`
        : "";
    return NextResponse.json(
      { error: `検証に失敗しました${detail}` },
      { status: 400 },
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "検証に失敗しました" }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  await saveCredential({
    id: credential.id,
    userId: user.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  });

  // 登録完了 = そのままログイン状態にする（任意。要件に応じて分離してもよい）
  await login(user.id);

  return NextResponse.json({ verified: true });
}
