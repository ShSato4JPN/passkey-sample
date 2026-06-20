# Passkey Sample (TypeScript + React + WebAuthn)

業務向けのパスキー（WebAuthn）実装を学ぶためのサンプルです。
[SimpleWebAuthn](https://simplewebauthn.dev/) を使い、登録・認証の一連の流れを
セキュリティのベストプラクティスに沿って実装しています。

> **このブランチ (`feat/prisma-vercel-db`) は永続化に Prisma + PostgreSQL を使う版です。**
> インメモリ版は `main` ブランチにあります。

## 技術スタック

- **Next.js (App Router)** — フロント(React)とバックエンド(API Routes)を1リポジトリで
- **TypeScript** — 型安全
- **@simplewebauthn/server** / **@simplewebauthn/browser** — WebAuthn の定番ライブラリ
- **Prisma + PostgreSQL** — 永続化（Vercel Marketplace の Neon Postgres 等を想定）

## セットアップ

```bash
npm install                 # postinstall で prisma generate が走る
cp .env.example .env        # DATABASE_URL / RP 設定を記入

# ローカル DB を Docker で起動（既存の Postgres があれば不要）
docker compose up -d        # localhost:5432 に postgres を起動

# DB スキーマを作成（初回マイグレーション）
npm run db:migrate          # = prisma migrate dev

npm run dev
```

`.env.example` の `DATABASE_URL` はこの `docker-compose.yml` の設定に
そのまま一致しているので、Docker を使う場合は編集不要です。

ブラウザで http://localhost:3000 を開きます。

> パスキーには **HTTPS または localhost** が必須です。`localhost` での開発はそのまま動きます。
> 別ホスト名や実機テストでは HTTPS を用意し、`.env` の `RP_ID` / `EXPECTED_ORIGIN` を合わせてください。

### 期限切れ challenge の定期掃除（Cron）

中断された ceremony（options のみで verify に来なかった）で残る期限切れ
challenge を、定期削除するための仕組み。**ローカルと本番で同じ API ルート**
（`/api/cron/cleanup-challenges`、`CRON_SECRET` で保護）を使う。

**ローカル（Docker cron サーバー）:**

```bash
# db と一緒に cron コンテナも起動（busybox crond が定期的に掃除エンドポイントを叩く）
docker compose up -d            # db + cron
docker logs -f passkey-cron     # cron の動作ログ
```

- 既定は5分間隔。`.env` の `CRON_SCHEDULE`（例 `"* * * * *"`）で変更可。
- アプリ(`npm run dev`)が起動している必要がある（cron はホストの :3000 を叩く）。
- 手動実行: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/cleanup-challenges`

**本番（Vercel Cron）:**

`vercel.json` の `crons` で同じルートを叩く（既定: 毎時）。
`CRON_SECRET` を環境変数に設定すると、Vercel Cron が自動で
`Authorization: Bearer <CRON_SECRET>` を付与する。

```json
{ "crons": [{ "path": "/api/cron/cleanup-challenges", "schedule": "0 * * * *" }] }
```

### Vercel の DB を使う場合（Neon Postgres）

Vercel では Postgres を **Marketplace 連携**で利用します（旧 Vercel Postgres は廃止）。

1. Vercel ダッシュボード → Storage → Marketplace から **Neon** 等を追加してプロジェクトに連携
2. `DATABASE_URL` が自動でプロジェクトの環境変数に登録される
3. ローカルへ取得: `vercel env pull .env`
4. スキーマ適用: 本番は `npm run db:deploy`（= `prisma migrate deploy`）

> Neon などプーリング有りの接続では、マイグレーション用に直結 URL (`DIRECT_URL`) を
> 併用するのが定石です（`.env.example` 参照）。

## 操作チートシート

| やりたいこと | コマンド |
| --- | --- |
| 依存インストール | `npm install`（`postinstall` で `prisma generate`） |
| DB + cron 起動 | `docker compose up -d` |
| DB だけ起動 | `docker compose up -d db` |
| 停止 | `docker compose down`（データも消すなら `-v`） |
| 初回/差分マイグレーション | `npm run db:migrate` |
| 本番マイグレーション適用 | `npm run db:deploy` |
| GUI で DB を見る | `npm run db:studio`（Prisma Studio） |
| アプリ起動（dev） | `npm run dev` → http://localhost:3000 |
| 本番ビルド | `npm run build`（`prisma generate` 込み） |
| cron の動作ログ | `docker logs -f passkey-cron` |
| 掃除を手動実行 | `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/cleanup-challenges` |
| DB に直接 SQL | `docker exec -it passkey-postgres psql -U postgres -d passkey` |

> 最短手順: `npm install` → `docker compose up -d` → `npm run db:migrate` → `npm run dev`

## データモデル (Prisma)

`prisma/schema.prisma` に定義:

| モデル | 役割 |
| --- | --- |
| `User` | ユーザー。`id` は推測不能なユーザーハンドル |
| `Credential` | パスキー。公開鍵(`Bytes`/bytea)・`counter`・`transports` を保持 |
| `Challenge` | フロー中の一時 challenge。`sessionId` に紐づけワンタイム + TTL |

DB アクセスは `src/lib/store.ts`（Prisma 実装）に集約し、API ルートは
その関数越しに DB を触ります。Prisma クライアントは `src/lib/prisma.ts` で
`globalThis` singleton 化し、dev の HMR によるコネクション枯渇を防いでいます。

## ディレクトリ構成

```
prisma/
├── schema.prisma                       # User / Credential / Challenge モデル
└── migrations/                         # マイグレーション履歴
docker/
└── cron/entrypoint.sh                  # cron コンテナ起動スクリプト
docker-compose.yml                      # Postgres + cron サーバー
vercel.json                             # 本番 Vercel Cron 設定
src/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── register/options/route.ts   # 登録: オプション生成
│   │   │   ├── register/verify/route.ts    # 登録: 応答検証・保存
│   │   │   ├── login/options/route.ts      # 認証: オプション生成
│   │   │   ├── login/verify/route.ts       # 認証: 応答検証
│   │   │   ├── me/route.ts                 # ログイン状態取得
│   │   │   └── logout/route.ts             # ログアウト
│   │   └── cron/cleanup-challenges/route.ts # 期限切れ challenge 掃除
│   ├── page.tsx                        # React クライアント UI
│   └── layout.tsx
└── lib/
    ├── webauthn/config.ts              # RP 設定（rpID, origin 等）
    ├── prisma.ts                       # PrismaClient の globalThis singleton
    ├── store.ts                        # DB アクセス層（Prisma 実装）
    └── session.ts                      # セッション/Cookie 管理
```

## 認証フロー

> シーケンス図・フローチャート（Mermaid）は [`docs/flow.md`](./docs/flow.md) を参照。

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

### challenge とセッションの役割分担（重要な前提）

パスキーは「**ログインの瞬間**」を守るが、「**ログインし続けている状態**」は
別の仕組み（セッション Cookie）が守る。両者は層が違う。

| | challenge | セッション Cookie (`uid`) |
| --- | --- | --- |
| 守る対象 | ログインの瞬間（認証 ceremony） | ログイン後の状態維持 |
| 性質 | 使い捨て・署名対象・verify で即削除 | ログイン中ずっと提示される bearer |
| 寿命 | 5分 TTL / 1回で消費 | 7日 |

- `challenge` は verify 成功時に `consumeChallenge` で**即削除**される（中断分は
  cron が後始末）。リプレイ攻撃を防ぐための使い捨て値。
- 一方 `uid` Cookie は「持っていれば認証済み」とみなす bearer なので、
  **ここの堅牢さがそのままログイン後の安全性**になる。本サンプルの `uid` は
  仕組みを示すための簡易実装（生のユーザーID）であり、本番では署名/暗号化
  セッションに置き換えること（下記「本番化」参照）。

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

1. **セッション** ⚠️最優先 — `src/lib/session.ts` の `uid` は生のユーザーIDを
   Cookie に入れているだけ。署名/暗号化セッション（iron-session 等）か
   サーバーサイドセッションストアに置き換える（漏洩時の失効・改ざん検知のため）。
2. **永続ストア** — このブランチは Prisma + PostgreSQL 済み。本番は接続先を
   Vercel Marketplace（Neon 等）にし、プーリング/`DIRECT_URL` を適切に設定。
3. **レート制限 / 監査ログ** — options・verify エンドポイントに導入。
4. **challenge の掃除** — cron（ローカル）/ Vercel Cron（本番）を有効化済み。
5. **アカウント復旧** — 端末紛失に備え、複数パスキー登録や代替手段を設計。
6. **RP_ID / Origin** — 本番ドメインに合わせて `.env` を設定。

## 参考

- [SimpleWebAuthn 公式](https://simplewebauthn.dev/)
- [W3C WebAuthn](https://www.w3.org/TR/webauthn-3/)
- [passkeys.dev](https://passkeys.dev/)
