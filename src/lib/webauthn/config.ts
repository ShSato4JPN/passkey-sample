/**
 * WebAuthn (Passkey) の RP (Relying Party) 設定。
 *
 * セキュリティ上の最重要ポイント:
 *  - rpID と expectedOrigin はサーバー側の検証で「期待値」として使う。
 *    クライアントから送られた値を信用せず、必ずここで定義した固定値と照合する。
 *  - これにより、別ドメイン（フィッシングサイト）で取得した資格情報を
 *    弾くことができる（WebAuthn の origin バインディングの肝）。
 */

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。.env を確認してください。`);
  }
  return value;
}

/** 認証ダイアログに表示される RP の名前 */
export const rpName = requireEnv("RP_NAME", "Passkey Sample");

/** パスキーをスコープするドメイン（ホスト名のみ。スキーム/ポートを含めない） */
export const rpID = requireEnv("RP_ID", "localhost");

/**
 * 検証時に期待する Origin（複数許可する場合はカンマ区切り）。
 * SimpleWebAuthn は文字列 or 文字列配列を受け付ける。
 */
export const expectedOrigin: string | string[] = (() => {
  const raw = requireEnv("EXPECTED_ORIGIN", "http://localhost:3000");
  const origins = raw.split(",").map((o) => o.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
})();

/**
 * ユーザー検証（生体認証/PIN）の要求レベル。
 *
 * 重要: 検証側 (verify*) で requireUserVerification: true を使うなら、
 *       オプション生成側もここを "required" に揃えること。
 *       "preferred" にすると認証器が UV を省略でき、その応答を
 *       verify 側が「UV必須なのに無い」として弾いて検証失敗になる。
 */
export const userVerification = "required" as const;
