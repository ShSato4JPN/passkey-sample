"use client";

import {
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from "@simplewebauthn/browser";
import { useEffect, useState } from "react";

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ok"; message: string };

interface Me {
  authenticated: boolean;
  username?: string;
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [me, setMe] = useState<Me | null>(null);

  // 初期表示でログイン状態を取得
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ authenticated: false }));
  }, []);

  const busy = status.state === "loading";

  /** 共通: エラーをユーザー向けメッセージに変換 */
  function toMessage(error: unknown): string {
    // ユーザーがダイアログをキャンセルした等は WebAuthnError として届く
    if (error instanceof WebAuthnError) {
      return `パスキー操作がキャンセルまたは失敗しました: ${error.message}`;
    }
    if (error instanceof Error) return error.message;
    return "不明なエラーが発生しました";
  }

  /** パスキー登録 */
  async function handleRegister() {
    if (!username.trim()) {
      setStatus({ state: "error", message: "ユーザー名を入力してください" });
      return;
    }
    setStatus({ state: "loading" });
    try {
      // Step 1: サーバーから登録オプション（challenge 等）を取得
      const optionsRes = await fetch("/api/auth/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!optionsRes.ok) throw new Error((await optionsRes.json()).error);
      const optionsJSON = await optionsRes.json();

      // Step 2: ブラウザ/OS のパスキー作成 UI を起動
      const attResp = await startRegistration({ optionsJSON });

      console.log(attResp);

      // Step 3: 応答をサーバーで検証・保存
      const verifyRes = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, response: attResp }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok || !verifyJson.verified) {
        throw new Error(verifyJson.error ?? "登録に失敗しました");
      }

      setStatus({ state: "ok", message: "パスキーを登録しました。" });
      setMe({ authenticated: true, username });
    } catch (error) {
      setStatus({ state: "error", message: toMessage(error) });
    }
  }

  /** パスキーでログイン（ユーザー名レス） */
  async function handleLogin() {
    setStatus({ state: "loading" });
    try {
      // Step 1: 認証オプションを取得
      const optionsRes = await fetch("/api/auth/login/options", {
        method: "POST",
      });
      if (!optionsRes.ok) throw new Error((await optionsRes.json()).error);
      const optionsJSON = await optionsRes.json();

      console.log(optionsJSON);

      // Step 2: パスキー選択 UI を起動
      const asseResp = await startAuthentication({ optionsJSON });

      console.log(asseResp);

      // Step 3: 応答をサーバーで検証
      const verifyRes = await fetch("/api/auth/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(asseResp),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok || !verifyJson.verified) {
        throw new Error(verifyJson.error ?? "ログインに失敗しました");
      }

      setStatus({ state: "ok", message: "ログインしました。" });
      setMe({ authenticated: true, username: verifyJson.username });
    } catch (error) {
      setStatus({ state: "error", message: toMessage(error) });
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe({ authenticated: false });
    setStatus({ state: "idle" });
    setUsername("");
  }

  // ---- ログイン済み表示 ----
  if (me?.authenticated) {
    return (
      <main className="card welcome">
        <h1>ようこそ</h1>
        <p className="subtitle">
          <strong>{me.username}</strong> としてログイン中
        </p>
        <button className="secondary" onClick={handleLogout}>
          ログアウト
        </button>
      </main>
    );
  }

  // ---- 未ログイン表示 ----
  return (
    <main className="card">
      <h1>Passkey サンプル</h1>
      <p className="subtitle">
        WebAuthn / SimpleWebAuthn によるパスワードレス認証
      </p>

      <label htmlFor="username">ユーザー名（登録時のみ使用）</label>
      <input
        id="username"
        type="text"
        autoComplete="username webauthn"
        placeholder="alice@example.com"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={busy}
      />

      <div className="row">
        <button onClick={handleRegister} disabled={busy}>
          パスキーを登録
        </button>
        <div className="divider">または</div>
        <button className="secondary" onClick={handleLogin} disabled={busy}>
          パスキーでログイン
        </button>
      </div>

      {status.state === "error" && (
        <div className="message error">{status.message}</div>
      )}
      {status.state === "ok" && (
        <div className="message ok">{status.message}</div>
      )}
    </main>
  );
}
