/**
 * ログイン（認証）の Step 2: ブラウザからの応答を検証。
 *
 * フロー:
 *   1. ブラウザが startAuthentication で得た response を受け取る
 *   2. response.id から該当する資格情報（公開鍵）を特定
 *   3. 保存しておいた challenge を取り出す（ワンタイム消費）
 *   4. verifyAuthenticationResponse で
 *        - challenge / origin / rpID 一致
 *        - 公開鍵による署名検証
 *        - counter の巻き戻りチェック（クローン検知）
 *   5. OK なら counter を更新し、ログイン状態を確立
 */

import { getSessionId, login } from "@/lib/session";
import {
  consumeChallenge,
  getCredentialById,
  getUserById,
  updateCredentialCounter,
} from "@/lib/store";
import { expectedOrigin, rpID } from "@/lib/webauthn/config";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let response: AuthenticationResponseJSON;
  try {
    response = (await request.json()) as AuthenticationResponseJSON;
  } catch {
    return NextResponse.json(
      { error: "不正なリクエストです" },
      { status: 400 },
    );
  }

  if (!response?.id) {
    return NextResponse.json({ error: "response が不正です" }, { status: 400 });
  }

  // 提示された資格情報IDからサーバー保存分を特定
  const credential = await getCredentialById(response.id);
  if (!credential) {
    return NextResponse.json(
      { error: "登録されていない資格情報です" },
      { status: 400 },
    );
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
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
      },
      requireUserVerification: true,
    });
  } catch (error) {
    console.error("認証検証エラー:", error);
    // 開発時は原因究明のため実際のエラーメッセージも返す（本番では返さない）
    const detail =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? `: ${error.message}`
        : "";
    return NextResponse.json(
      { error: `検証に失敗しました${detail}` },
      { status: 400 },
    );
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "検証に失敗しました" }, { status: 400 });
  }

  // counter を更新（巻き戻り検知のため必須）
  await updateCredentialCounter(
    credential.id,
    verification.authenticationInfo.newCounter,
  );

  const user = await getUserById(credential.userId);
  if (!user) {
    return NextResponse.json(
      { error: "ユーザーが見つかりません" },
      { status: 400 },
    );
  }

  await login(user.id);

  return NextResponse.json({ verified: true, username: user.username });
}
