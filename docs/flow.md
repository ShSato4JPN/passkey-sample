# Passkey 認証フロー図

実装（`src/app/api/auth/**`, `src/app/page.tsx`, `src/lib/**`）に対応したフロー図。

## 登場要素

| 要素 | 対応コード |
| --- | --- |
| User | エンドユーザー |
| Browser | `src/app/page.tsx`（React）+ `@simplewebauthn/browser` |
| Authenticator | OS/ブラウザのパスキー機構（Touch ID 等） |
| Server | `src/app/api/auth/**/route.ts` |
| Store | `src/lib/store.ts`（運用時は DynamoDB 等） |

---

## 1. 登録（パスキー作成）— シーケンス図

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser
    participant Authenticator as Authenticator (OS)
    participant Server
    participant Store

    User->>Browser: ユーザー名入力 →「パスキーを登録」

    Note over Browser,Server: Step 1: オプション取得
    Browser->>Server: POST /register/options { username }
    Server->>Store: getUserByUsername / createUser
    Server->>Server: generateRegistrationOptions(challenge生成)
    Server->>Store: saveChallenge(sid, challenge)
    Server-->>Browser: options(challenge, rpID, user, excludeCredentials)<br/>Set-Cookie: sid

    Note over Browser,Authenticator: Step 2: 認証器でキーペア生成
    Browser->>Authenticator: startRegistration(options)
    Authenticator->>User: ユーザー検証 (生体/PIN)
    User-->>Authenticator: 承認
    Authenticator->>Authenticator: 公開鍵/秘密鍵を生成<br/>秘密鍵は端末内に保管
    Authenticator-->>Browser: attestation response(公開鍵, 署名)

    Note over Browser,Server: Step 3: 検証と保存
    Browser->>Server: POST /register/verify { username, response }
    Server->>Store: consumeChallenge(sid) ※ワンタイム消費
    Server->>Server: verifyRegistrationResponse<br/>(challenge / origin / rpID / UV を検証)
    alt 検証成功
        Server->>Store: saveCredential(公開鍵, counter, transports)
        Server->>Server: login(userId) → Set-Cookie: uid
        Server-->>Browser: { verified: true }
        Browser-->>User: 登録完了・ログイン状態
    else 検証失敗
        Server-->>Browser: 400 { error }
        Browser-->>User: エラー表示
    end
```

---

## 2. ログイン（認証）— シーケンス図

ユーザー名レス（Discoverable Credential）方式。

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser
    participant Authenticator as Authenticator (OS)
    participant Server
    participant Store

    User->>Browser: 「パスキーでログイン」

    Note over Browser,Server: Step 1: オプション取得
    Browser->>Server: POST /login/options
    Server->>Server: generateAuthenticationOptions(challenge生成)<br/>allowCredentials 省略 = どのパスキーでも可
    Server->>Store: saveChallenge(sid, challenge)
    Server-->>Browser: options(challenge, rpID)<br/>Set-Cookie: sid

    Note over Browser,Authenticator: Step 2: パスキーで署名
    Browser->>Authenticator: startAuthentication(options)
    Authenticator->>User: パスキー選択 + ユーザー検証
    User-->>Authenticator: 承認
    Authenticator->>Authenticator: challenge に秘密鍵で署名
    Authenticator-->>Browser: assertion response(credentialId, 署名, userHandle)

    Note over Browser,Server: Step 3: 署名検証
    Browser->>Server: POST /login/verify { response }
    Server->>Store: getCredentialById(response.id)
    alt 資格情報なし
        Server-->>Browser: 400 { error: 登録されていない資格情報 }
    else 資格情報あり
        Server->>Store: consumeChallenge(sid) ※ワンタイム消費
        Server->>Server: verifyAuthenticationResponse<br/>(公開鍵で署名検証 / challenge / origin / counter)
        alt 検証成功
            Server->>Store: updateCredentialCounter(newCounter)
            Server->>Server: login(userId) → Set-Cookie: uid
            Server-->>Browser: { verified: true, username }
            Browser-->>User: ログイン完了
        else 検証失敗
            Server-->>Browser: 400 { error }
            Browser-->>User: エラー表示
        end
    end
```

---

## 3. 全体フローチャート（登録／ログインの分岐）

```mermaid
flowchart TD
    Start([アクセス]) --> Me{/api/auth/me<br/>ログイン済み?}
    Me -->|Yes| Home[ようこそ画面]
    Me -->|No| Choice{操作を選択}

    %% 登録
    Choice -->|パスキーを登録| RName{ユーザー名入力済み?}
    RName -->|No| RErr[エラー: ユーザー名必須]
    RName -->|Yes| ROpt[POST /register/options<br/>challenge発行・保存]
    ROpt --> RCreate[startRegistration<br/>認証器でキーペア生成 + UV]
    RCreate --> RVerify[POST /register/verify]
    RVerify --> RChk{challenge/origin/<br/>rpID/UV 検証OK?}
    RChk -->|No| RFail[エラー: 検証失敗]
    RChk -->|Yes| RSave[公開鍵を保存<br/>login uid発行]
    RSave --> Home

    %% ログイン
    Choice -->|パスキーでログイン| LOpt[POST /login/options<br/>challenge発行・保存]
    LOpt --> LGet[startAuthentication<br/>パスキー選択 + UV + 署名]
    LGet --> LVerify[POST /login/verify]
    LVerify --> LFind{credentialId に<br/>該当あり?}
    LFind -->|No| LFail1[エラー: 未登録の資格情報]
    LFind -->|Yes| LChk{署名/challenge/<br/>counter 検証OK?}
    LChk -->|No| LFail2[エラー: 検証失敗]
    LChk -->|Yes| LCounter[counter更新<br/>login uid発行]
    LCounter --> Home

    Home --> Logout[ログアウト<br/>sid/uid削除]
    Logout --> Me
```

---

## challenge と Cookie の流れ（補足）

```mermaid
flowchart LR
    A[options エンドポイント] -->|"challenge生成"| B[(Store: challenges)]
    A -->|"Set-Cookie: sid"| C[Browser]
    C -->|"sid を送信"| D[verify エンドポイント]
    D -->|"consumeChallenge: 取得即削除"| B
    D -->|"検証で expectedChallenge として照合"| E{一致 & 未失効?}
    E -->|Yes| F[検証続行]
    E -->|No| G[400 challenge無効]
```

- `challenge` は **ワンタイム**（`consumeChallenge` で取得と同時に削除）+ **5分TTL** → リプレイ攻撃対策
- `sid` Cookie は **httpOnly / secure(本番) / sameSite=lax**
