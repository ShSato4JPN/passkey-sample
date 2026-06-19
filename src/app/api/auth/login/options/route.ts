/**
 * ログイン（認証）の Step 1: 認証オプションの生成。
 *
 * このサンプルでは「ユーザー名なしログイン（Discoverable Credential / パスキー）」を
 * 採用しているため allowCredentials を空にする。
 *   - allowCredentials を空にすると、認証器側が登録済みパスキーを提示し、
 *     どのユーザーかは応答内の userHandle で判別する。
 *   - 特定ユーザーに絞りたい場合は、そのユーザーの資格情報IDを渡す。
 */

import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { rpID, userVerification } from "@/lib/webauthn/config";
import { saveChallenge } from "@/lib/store";
import { getOrCreateSessionId } from "@/lib/session";

export async function POST() {
  const options = await generateAuthenticationOptions({
    rpID,
    // allowCredentials を省略 = どのパスキーでもログイン可（ユーザー名レス）。
    // 空配列を渡すと一部プラットフォームで挙動が不安定になるため、渡さない。
    userVerification,
  });

  const sessionId = await getOrCreateSessionId();
  saveChallenge(sessionId, options.challenge);

  return NextResponse.json(options);
}
