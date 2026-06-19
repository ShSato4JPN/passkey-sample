# Passkey Sample (TypeScript + React + WebAuthn)

業務向けのパスキー（WebAuthn）実装を学ぶためのサンプルです。
[SimpleWebAuthn](https://simplewebauthn.dev/) を使い、登録・認証の一連の流れを
セキュリティのベストプラクティスに沿って実装しています。

## 技術スタック

- **Next.js (App Router)** — フロント(React)とバックエンド(API Routes)を1リポジトリで
- **TypeScript** — 型安全
- **@simplewebauthn/server** / **@simplewebauthn/browser** — WebAuthn の定番ライブラリ

## セットアップ

```bash
npm install
cp .env.example .env   # 必要なら値を調整
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

> パスキーには **HTTPS または localhost** が必須です。`localhost` での開発はそのまま動きます。
> 別ホスト名や実機テストでは HTTPS を用意し、`.env` の `RP_ID` / `EXPECTED_ORIGIN` を合わせてください。

## ディレクトリ構成

```
src/
├── app/
│   ├── api/auth/
│   │   ├── register/options/route.ts   # 登録: オプション生成
│   │   ├── register/verify/route.ts    # 登録: 応答検証・保存
│   │   ├── login/options/route.ts      # 認証: オプション生成
│   │   ├── login/verify/route.ts       # 認証: 応答検証
│   │   ├── me/route.ts                 # ログイン状態取得
│   │   └── logout/route.ts             # ログアウト
│   ├── page.tsx                        # React クライアント UI
│   └── layout.tsx
└── lib/
    ├── webauthn/config.ts              # RP 設定（rpID, origin 等）
    ├── store.ts                        # データストア（サンプルはインメモリ）
    └── session.ts                      # セッション/Cookie 管理
```

## 認証フロー

### 登録（パスキー作成）

```
ブラウザ                          サーバー
  │  POST /register/options ─────▶ │ challenge生成・保存
  │ ◀──────────── options(challenge)│
  │ startRegistration() でOS UI起動 │
  │  POST /register/verify ──────▶ │ challenge/origin/rpID検証 → 公開鍵保存
  │ ◀──────────────── verified=true │
```

### 認証（ログイン）

```
ブラウザ                          サーバー
  │  POST /login/options ────────▶ │ challenge生成・保存
  │ ◀──────────── options(challenge)│
  │ startAuthentication() でOS UI  │
  │  POST /login/verify ─────────▶ │ 署名検証・counter検証 → ログイン確立
  │ ◀──────────────── verified=true │
```

## 実装に込めたセキュリティのポイント

| 項目 | 内容 |
| --- | --- |
| **Origin バインディング** | `expectedOrigin` / `expectedRPID` をサーバー固定値で検証。フィッシングサイト経由の資格情報を弾く。 |
| **challenge のワンタイム化** | サーバーで生成・保存し、検証時に消費。リプレイ攻撃を防止。TTL(5分)付き。 |
| **ユーザー検証** | `requireUserVerification: true`。生体認証/PIN を要求。 |
| **counter 検証** | 認証ごとの署名カウンターを保存・照合し、巻き戻りで認証器クローンを検知。 |
| **Discoverable Credential** | `residentKey: required` でユーザー名レスログインに対応。 |
| **二重登録防止** | `excludeCredentials` で同一認証器の重複登録を防止。 |
| **Cookie 保護** | `httpOnly` + `secure`(本番) + `sameSite=lax`。XSS/CSRF を緩和。 |
| **ユーザーハンドル** | 推測不能なランダムID。個人情報を含めない（仕様推奨）。 |

## 本番化に向けて（このサンプルから変更すべき点）

1. **永続ストア** — `src/lib/store.ts` のインメモリ Map を DB（PostgreSQL 等）へ置換。
   `publicKey` は `Uint8Array` なので Base64URL 等でエンコードして保存する。
2. **セッション** — `src/lib/session.ts` を署名/暗号化セッション（iron-session 等）や
   サーバーサイドセッションストアへ。
3. **レート制限 / 監査ログ** — options・verify エンドポイントに導入。
4. **アカウント復旧** — 端末紛失に備え、複数パスキー登録や代替手段を設計。
5. **RP_ID / Origin** — 本番ドメインに合わせて `.env` を設定。

## 参考

- [SimpleWebAuthn 公式](https://simplewebauthn.dev/)
- [W3C WebAuthn](https://www.w3.org/TR/webauthn-3/)
- [passkeys.dev](https://passkeys.dev/)
